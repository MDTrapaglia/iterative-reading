#!/usr/bin/env python3
import json
import os
import re
import subprocess
from urllib.parse import urlparse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = os.getenv('ITERATIVE_READING_HOST', '127.0.0.1')
PORT = int(os.getenv('ITERATIVE_READING_PORT', '3071'))
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_TEXT_CHARS = int(os.getenv('ITERATIVE_READING_MAX_TEXT_CHARS', '24000'))
HERMES_TIMEOUT_SECONDS = int(os.getenv('ITERATIVE_READING_HERMES_TIMEOUT', '120'))
HERMES_MODEL = os.getenv('ITERATIVE_READING_HERMES_MODEL', '').strip()
HERMES_PROVIDER = os.getenv('ITERATIVE_READING_HERMES_PROVIDER', '').strip()
HERMES_BIN = os.getenv('ITERATIVE_READING_HERMES_BIN', os.path.expanduser('~/.local/bin/hermes')).strip()


def clean_input_text(raw_text: str) -> str:
    text = str(raw_text or '').replace('\r\n', '\n').replace('\r', '\n').replace('\u00ad', '')
    text = re.sub(r'([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n(?=[a-záéíóúüñ])', r'\1', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    paragraphs = []
    for paragraph in re.split(r'\n\s*\n', text):
        compact = re.sub(r'\s+', ' ', paragraph.replace('\n', ' ')).strip()
        if compact:
            paragraphs.append(compact)

    return '\n\n'.join(paragraphs)


class IterativeReadingHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def _json_response(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        request_path = urlparse(self.path).path
        if request_path not in ('/api/summarize', '/iterative-reading/api/summarize'):
            self._json_response(HTTPStatus.NOT_FOUND, {'error': 'not_found'})
            return

        try:
            content_length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self._json_response(HTTPStatus.BAD_REQUEST, {'error': 'invalid_content_length'})
            return

        if content_length <= 0:
            self._json_response(HTTPStatus.BAD_REQUEST, {'error': 'empty_body'})
            return

        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except Exception:
            self._json_response(HTTPStatus.BAD_REQUEST, {'error': 'invalid_json'})
            return

        text = clean_input_text(payload.get('text', ''))
        title = str(payload.get('title', '')).strip()

        if not text:
            self._json_response(HTTPStatus.BAD_REQUEST, {'error': 'missing_text'})
            return

        if len(text) > MAX_TEXT_CHARS:
            self._json_response(
                HTTPStatus.BAD_REQUEST,
                {'error': 'text_too_long', 'max_chars': MAX_TEXT_CHARS},
            )
            return

        try:
            levels = summarize_with_hermes(text=text, title=title)
            self._json_response(HTTPStatus.OK, {'levels': levels, 'engine': 'hermes/codex'})
        except Exception as exc:
            self._json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {'error': 'summarization_failed', 'detail': str(exc)},
            )


def _extract_json_object(output: str) -> dict:
    cleaned = output.strip()

    fence_match = re.search(r'```(?:json)?\s*(\{[\s\S]*\})\s*```', cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    if cleaned.startswith('{') and cleaned.endswith('}'):
        return json.loads(cleaned)

    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1 or end <= start:
        raise ValueError('no_json_object_in_model_output')

    return json.loads(cleaned[start : end + 1])


def _normalize_levels(model_payload: dict):
    levels = model_payload.get('levels')
    if not isinstance(levels, list) or len(levels) != 5:
        raise ValueError('invalid_levels_count')

    normalized = []
    for idx, level in enumerate(levels):
        lines = level.get('lines') if isinstance(level, dict) else None
        if not isinstance(lines, list):
            raise ValueError(f'invalid_level_lines_{idx}')

        cleaned_lines = [str(line).strip() for line in lines if str(line).strip()]
        if not cleaned_lines:
            raise ValueError(f'empty_level_{idx}')

        normalized.append({'lines': cleaned_lines})

    return normalized


def summarize_with_hermes(text: str, title: str):
    doc_title = title or 'Texto importado'

    prompt = (
        'Sos un asistente de resumen multiescala. '\
        'Debes responder SOLO JSON válido, sin markdown ni explicación. '\
        'Schema exacto: {"levels":[{"lines":["..."]},{"lines":["..."]},{"lines":["..."]},{"lines":["..."]},{"lines":["..."]}]}. '\
        'Exactamente 5 niveles. '\
        'Nivel 1 (index 0): detalle completo fragmentado en líneas legibles. '\
        'Nivel 2 (index 1): detalle sintético. '\
        'Nivel 3 (index 2): resumen por oraciones núcleo. '\
        'Nivel 4 (index 3): resumen de párrafo (1-2 líneas). '\
        'Nivel 5 (index 4): esencia mínima (1 línea). '\
        'Estilo por defecto: humano editorial (frases naturales y fluidas), evitar estilo telegráfico. '\
        'Si hay cambio de párrafo, podés insertar la línea exacta "__PARA_BREAK__" para marcar separación visual. '\
        'No uses puntos suspensivos ni "..." ni "…". '\
        'Mantén idioma original del texto. '\
        'No incluyas prefijos como "Título:" ni meta-comentarios. '\
        f'Título de referencia: {doc_title}\n\n'
        f'TEXTO:\n{text}\n'
    )

    cmd = [HERMES_BIN, 'chat', '-q', prompt, '-Q']
    if HERMES_PROVIDER:
        cmd += ['--provider', HERMES_PROVIDER]
    if HERMES_MODEL:
        cmd += ['-m', HERMES_MODEL]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=HERMES_TIMEOUT_SECONDS,
        cwd=ROOT_DIR,
    )

    output = (result.stdout or '').strip()
    if result.returncode != 0:
        stderr = (result.stderr or '').strip()
        raise RuntimeError(f'hermes_exit_{result.returncode}: {stderr or output}')

    parsed = _extract_json_object(output)
    return _normalize_levels(parsed)


def main():
    with ThreadingHTTPServer((HOST, PORT), IterativeReadingHandler) as httpd:
        print(f'iterative-reading server running on http://{HOST}:{PORT}', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
