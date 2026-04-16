# Contributing to iterative-reading

Este documento está pensado para devs y agentes que retomen el proyecto.
Objetivo: evitar regresiones en UX de navegación, transición de abstracción y persistencia local.

## 1. Contexto rápido del proyecto

- App frontend pura (sin backend): `index.html`, `styles.css`, `app.js`.
- Core UX: lectura multiescala en canvas con pan/zoom/pinch.
- Datos:
  - `baseDocs` embebidos en código.
  - docs del usuario en `localStorage`.

Documentación funcional/técnica principal: `README.md`.

## 2. Setup local

No requiere npm.

Opciones:
- Abrir `index.html` directamente.
- Recomendado:
  - `python3 -m http.server 8080`
  - abrir `http://localhost:8080`

## 3. Checklist antes de tocar código

1. Leer `README.md` completo.
2. Identificar qué capa vas a tocar:
   - input/cámara,
   - abstracción,
   - render,
   - UI/HUD,
   - persistencia local.
3. Definir criterio observable de éxito (qué debería notar el usuario).
4. Evitar cambios mezclados (feature + refactor masivo en un mismo commit).

## 4. Guía por zonas críticas

### A) Cámara e input (pointer/wheel)
Funciones y handlers clave:
- `setScaleAroundPoint`
- `beginPinch`, `updatePinch`
- listeners `pointerdown/move/up/cancel`
- listener `wheel`

Riesgos comunes:
- “saltos” de cámara por cambiar el orden de cálculo world/screen.
- pérdida de foco en zoom (zoom al centro de pantalla en vez de puntero).
- conflictos entre drag y pinch cuando cambia cantidad de pointers.

Verificar siempre:
- pan suave con mouse/touch,
- zoom centrado donde apunta el cursor,
- pinch estable al entrar/salir de gesto de 2 dedos.

### B) Abstracción por escala
Lógica clave:
- `ABSTRACTION_LEVELS`
- `getAbstractionBlend`
- `buildAbstractionLevelsFromText`

Riesgos comunes:
- índices inválidos de niveles.
- transiciones demasiado abruptas.
- reducción excesiva de texto por heurísticas.

Verificar siempre:
- transición consistente entre los 5 niveles,
- texto legible en cada nivel,
- textos importados generan `levels` válidos.

### C) Render
Funciones clave:
- `render`
- `drawParagraphCard`
- `wrapText`
- `docsToBlocks`

Riesgos comunes:
- degradación de performance por trabajo pesado por frame.
- glitches visuales por cambios en alpha/scale de transición.
- desborde de texto o cards demasiado altas en ciertos zooms.

Verificar siempre:
- FPS estable en uso normal,
- sin flicker al hacer zoom in/out continuo,
- cards y tipografías siguen siendo legibles.

### D) Persistencia local
Claves actuales:
- `iterative_reading_user_docs_v1`
- `iterative_reading_hud_minimized_v1`

Riesgos comunes:
- romper compatibilidad con datos existentes.
- guardar estructuras incompletas en `userDocs`.

Verificar siempre:
- recargar página mantiene docs guardados,
- HUD recuerda estado minimizado,
- la app no rompe si localStorage tiene basura o JSON inválido.

## 5. Convenciones de cambios

- Commits pequeños y descriptivos (Conventional Commits recomendado):
  - `feat: ...`
  - `fix: ...`
  - `docs: ...`
  - `refactor: ...`
- Si cambiás comportamiento visible, actualizar README.
- Si agregás teclas rápidas o nuevos controles, documentarlos explícitamente.

## 6. QA manual mínimo (obligatorio)

Antes de push:

1) Navegación
- Pan con mouse drag.
- Zoom con rueda (in/out repetido).
- Pinch touch (si aplica entorno).

2) Abstracción
- Confirmar que cambia de nivel al alejar/acercar.
- Confirmar que transición no “salta”.

3) Importación
- Guardar texto corto y texto largo.
- Verificar aparición en lista y render en canvas.

4) Visibilidad
- Toggle de checkboxes por doc.
- Botones “Todos” y “Ninguno”.

5) HUD
- Minimizar y restaurar panel.
- Recargar página y validar persistencia del estado.

6) Resiliencia
- Simular localStorage inválido (si podés) y confirmar fallback seguro.

## 7. Performance guardrails

- Evitar lógica O(n^2) por frame dentro de `render`.
- Si agregás cómputo costoso, precalcular fuera del loop.
- No introducir operaciones de DOM frecuentes dentro de `requestAnimationFrame`.

## 8. Roadmap sugerido (cuando haya tiempo)

- CRUD completo de docs de usuario.
- Export/import JSON.
- Abstracción semántica con modelo.
- Navegación por teclado (shortcut `H` para HUD, etc.).
- Tests automáticos de regresión visual.

## 9. Definition of Done para PRs/cambios

Un cambio está listo cuando:
- pasa el QA manual mínimo,
- no rompe persistencia local existente,
- README/CONTRIBUTING están alineados con el comportamiento real,
- commit message describe claramente impacto funcional.
