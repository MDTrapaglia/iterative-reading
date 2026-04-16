# iterative-reading

Canvas interactivo para lectura multiescala: el mismo texto se visualiza con diferentes niveles de abstracción según el zoom de cámara.

La idea central es que al alejarte ves una versión más resumida (esencia), y al acercarte recuperás detalle progresivamente.

## Estado actual

MVP funcional en frontend puro (HTML/CSS/JS, sin backend):
- Navegación fluida por canvas (pan + zoom con rueda y pinch).
- Transición visual entre 5 niveles de abstracción.
- Dataset base embebido + importación de textos del usuario.
- Persistencia local con `localStorage`.
- Panel lateral minimizable para no tapar el canvas.

## Features implementadas

### 1) Navegación de cámara
- Pan con drag (pointer events).
- Zoom con rueda del mouse (`wheel`) centrado en el puntero.
- Zoom táctil con pinch (2 pointers) conservando foco en punto medio.
- Límites de escala:
  - `minScale = 0.22`
  - `maxScale = 4`

### 2) Abstracción multiescala (5 niveles)
Definida por `ABSTRACTION_LEVELS` en `app.js`:
- Nivel 5 · detalle total
- Nivel 4 · detalle sintético
- Nivel 3 · resumen por oraciones
- Nivel 2 · resumen de párrafo
- Nivel 1 · esencia mínima

El render no hace salto abrupto entre niveles: hace blend entre nivel “coarse” y “detailed” con alfa y cambio de escala para una transición más marcada.

### 3) Render en canvas
- Grilla de referencia + marcador de origen (0,0).
- Cards por documento con:
  - título,
  - texto envuelto (`wrapText`),
  - estilo visual por bloque (paleta cíclica).
- Layout en grilla de 2 columnas (`docsToBlocks`).
- Loop de render continuo con `requestAnimationFrame`.

### 4) Carga de textos de usuario
Desde panel:
- campo de título,
- textarea para texto fuente,
- botón “Guardar en base”.

Al guardar:
- se generan 5 niveles de abstracción con heurística local,
- se crea `id` tipo `user-<timestamp>-<slug>`,
- se persiste en localStorage,
- queda visible en la lista de documentos.

### 5) Heurística de resumen local (sin LLM)
Pipeline (`buildAbstractionLevelsFromText`):
1. split en oraciones (`splitSentences`),
2. recorte por cantidad de palabras (`shortenSentence`),
3. fusión de pares (`fuseSentencePair`),
4. resumen de párrafo (1 línea),
5. esencia (línea aún más corta).

### 6) Gestión de visibilidad de documentos
- Lista con checkbox por documento.
- Botones “Todos” y “Ninguno”.
- Estado de visibilidad en memoria de sesión (`visibleDocIds`).

### 7) HUD minimizable
- Botón “Minimizar panel / Mostrar panel”.
- En modo minimizado se ocultan título + controles, quedando visible la línea de estado de cámara.
- Persistencia de estado de HUD con `HUD_MINIMIZED_KEY` en localStorage.

### 8) Telemetría visual en pantalla
Línea `cameraInfo` con:
- nivel actual / tramo de transición,
- progreso de transición (%),
- `scale`, `x`, `y`,
- cantidad de docs visibles.

## Arquitectura técnica

### Stack
- HTML estático (`index.html`)
- CSS (`styles.css`)
- JavaScript vanilla (`app.js`)
- Sin build step
- Sin dependencias npm

### Módulos lógicos (app.js)
- Estado global:
  - `camera`, `pointers`, `pinchState`, `visibleDocIds`, `userDocs`.
- Datos:
  - `baseDocs` (semilla),
  - docs de usuario desde localStorage.
- Transformaciones:
  - construcción de niveles de abstracción,
  - mapeo de docs a bloques renderizables.
- Input:
  - pointerdown/move/up/cancel,
  - wheel,
  - eventos de botones UI.
- Render:
  - composición de escena por frame + blending entre niveles.

### Persistencia local
Claves de storage:
- `iterative_reading_user_docs_v1`
  - array de docs de usuario `{ id, title, sourceText, levels }`.
- `iterative_reading_hud_minimized_v1`
  - `"1"` o `"0"`.

No hay sincronización servidor ni multi-dispositivo todavía.

## Estructura del proyecto

- `index.html`: estructura del HUD y canvas.
- `styles.css`: layout/tema visual, estilos de panel y lista.
- `app.js`: lógica completa (estado, input, abstracción, render).
- `README.md`: documentación funcional + técnica.

## Cómo ejecutar local

Opción simple:
1. Abrir `index.html` en navegador.

Opción recomendada (evita restricciones de file:// en algunos contextos):
```bash
python3 -m http.server 8080
```
Luego abrir `http://localhost:8080`.

## Deploy actual

Está servido en:
- `https://matiastrapaglia.space/iterative-reading/` (token-gated en nginx según configuración del servidor).

## Limitaciones actuales

- El resumen es heurístico, no semántico profundo.
- No hay edición/eliminación de documentos de usuario.
- No hay búsqueda, clustering ni enlaces entre documentos.
- El layout de bloques es fijo (2 columnas), sin física ni auto-pack dinámico.

## Sugerencias de próximas mejoras

1. Integrar generación de abstracciones con modelo (local o API) para mayor calidad.
2. Agregar CRUD completo de docs (editar/borrar/exportar/importar JSON).
3. Persistencia remota (API + DB) y perfiles de usuario.
4. Navegación por teclado + shortcuts (ej. `H` para toggle HUD).
5. Modo “focus” por documento y minimapa del canvas.
6. Tests de regresión visual para transiciones de nivel.

## Notas para agentes futuros

Si vas a tocar comportamiento central, empezá por:
1. `ABSTRACTION_LEVELS` y `getAbstractionBlend` (lógica de nivel/mezcla),
2. `drawParagraphCard` y `render` (pipeline visual),
3. handlers de input (`pointer*`, `wheel`) para UX de cámara,
4. `buildAbstractionLevelsFromText` para calidad de resúmenes.

Puntos sensibles:
- Cambios en `camera.scale` impactan tipografía (se usa `textZoomFactor`).
- `requestAnimationFrame(render)` está siempre activo: evitar trabajo pesado por frame.
- Mantener compatibilidad de formato en localStorage para no romper datos ya guardados.
