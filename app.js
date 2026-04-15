const canvas = document.getElementById('board')
const ctx = canvas.getContext('2d')
const cameraInfoEl = document.getElementById('cameraInfo')
const hudPanelEl = document.getElementById('hudPanel')
const toggleHudBtn = document.getElementById('toggleHudBtn')

const docTitleEl = document.getElementById('docTitle')
const sourceInputEl = document.getElementById('sourceInput')
const saveDocBtn = document.getElementById('saveDocBtn')
const saveStatusEl = document.getElementById('saveStatus')
const docListEl = document.getElementById('docList')
const selectAllBtn = document.getElementById('selectAllBtn')
const selectNoneBtn = document.getElementById('selectNoneBtn')

const STORAGE_KEY = 'iterative_reading_user_docs_v1'
const HUD_MINIMIZED_KEY = 'iterative_reading_hud_minimized_v1'

const camera = {
  x: 80,
  y: 70,
  scale: 1,
  minScale: 0.22,
  maxScale: 4,
}

const ABSTRACTION_LEVELS = [
  { minScale: 2.3, label: 'Nivel 5 · detalle total' },
  { minScale: 1.45, label: 'Nivel 4 · detalle sintético' },
  { minScale: 0.95, label: 'Nivel 3 · resumen por oraciones' },
  { minScale: 0.55, label: 'Nivel 2 · resumen de párrafo' },
  { minScale: -Infinity, label: 'Nivel 1 · esencia mínima' },
]

const BLOCK_STYLES = [
  { color: 'rgba(60,120,245,0.15)', border: 'rgba(130,185,255,0.65)' },
  { color: 'rgba(45,170,130,0.14)', border: 'rgba(135,235,200,0.62)' },
  { color: 'rgba(182,120,255,0.14)', border: 'rgba(205,170,255,0.62)' },
  { color: 'rgba(255,150,90,0.14)', border: 'rgba(255,196,150,0.62)' },
]

const baseDocs = [
  {
    id: 'relato',
    title: 'Relato breve',
    sourceText:
      'Mara llegó al puerto antes del amanecer, con una carta doblada dentro del abrigo y la certeza de que no podía volver atrás. Mientras esperaba el barco, recordó la promesa hecha a su hermano: cruzar el río, encontrar al viejo cartógrafo y traer un mapa que mostrara un camino distinto para el pueblo. Cuando el sol salió, la niebla se abrió como una puerta y Mara entendió que el viaje no era huir de su historia, sino aprender a nombrarla de otra manera.',
    levels: [
      {
        lines: [
          'Mara llegó al puerto antes del amanecer, con una carta doblada dentro del abrigo y la certeza de que no podía volver atrás.',
          'Mientras esperaba el barco, recordó la promesa hecha a su hermano: cruzar el río, encontrar al viejo cartógrafo y traer un mapa que mostrara un camino distinto para el pueblo.',
          'Cuando el sol salió, la niebla se abrió como una puerta y Mara entendió que el viaje no era huir de su historia, sino aprender a nombrarla de otra manera.',
        ],
      },
      {
        lines: [
          'Mara llega al puerto con una carta y sin posibilidad de regresar.',
          'Su misión es hallar a un cartógrafo para traer un nuevo rumbo al pueblo.',
          'Al partir, descubre que viajar también significa reinterpretar su propia historia.',
        ],
      },
      {
        lines: [
          'Una joven parte hacia un cartógrafo para abrir una alternativa para su comunidad.',
          'En el viaje comprende que cambiar el destino colectivo exige cambiar el relato personal.',
        ],
      },
      { lines: ['Mara viaja para encontrar un nuevo camino para su pueblo y para sí misma.'] },
      { lines: ['Buscar un mapa nuevo también transforma a quien lo busca.'] },
    ],
  },
  {
    id: 'ciencia',
    title: 'Nota científica (fotosíntesis)',
    sourceText:
      'En la fotosíntesis, la clorofila de los cloroplastos absorbe fotones y usa esa energía para impulsar una cadena de transporte de electrones que produce ATP y NADPH. Luego, en el ciclo de Calvin, la enzima Rubisco fija dióxido de carbono y lo integra en moléculas orgánicas que finalmente permiten sintetizar azúcares. Este proceso convierte energía solar en energía química almacenada y, como subproducto, libera oxígeno que sostiene gran parte de la vida aeróbica en la Tierra.',
    levels: [
      {
        lines: [
          'En la fotosíntesis, la clorofila de los cloroplastos absorbe fotones y usa esa energía para impulsar una cadena de transporte de electrones que produce ATP y NADPH.',
          'Luego, en el ciclo de Calvin, la enzima Rubisco fija dióxido de carbono y lo integra en moléculas orgánicas que finalmente permiten sintetizar azúcares.',
          'Este proceso convierte energía solar en energía química almacenada y, como subproducto, libera oxígeno que sostiene gran parte de la vida aeróbica en la Tierra.',
        ],
      },
      {
        lines: [
          'La luz activa reacciones en los cloroplastos que generan ATP y NADPH.',
          'Con esa energía, el ciclo de Calvin fija CO₂ y construye azúcares.',
          'Así, la planta transforma radiación solar en biomasa y libera oxígeno.',
        ],
      },
      {
        lines: [
          'La fotosíntesis convierte luz y CO₂ en compuestos orgánicos útiles para la planta.',
          'En ese intercambio, el oxígeno liberado beneficia a los organismos que respiran.',
        ],
      },
      { lines: ['Las plantas transforman luz en alimento químico y oxígeno.'] },
      { lines: ['La luz se vuelve vida utilizable.'] },
    ],
  },
]

let userDocs = loadUserDocs()
let visibleDocIds = new Set([...baseDocs.map((d) => d.id), ...userDocs.map((d) => d.id)])

const pointers = new Map()
let dpr = Math.max(1, window.devicePixelRatio || 1)
let dragPointerId = null
let lastDrag = null
let pinchState = null

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function shortenSentence(sentence, maxWords = 14) {
  const words = sentence.split(' ')
  if (words.length <= maxWords) return sentence
  return `${words.slice(0, maxWords).join(' ')}…`
}

function fuseSentencePair(a, b, maxWords = 20) {
  const joined = `${a} ${b}`.trim()
  return shortenSentence(joined, maxWords)
}

function buildAbstractionLevelsFromText(rawText) {
  const sentences = splitSentences(rawText)
  if (!sentences.length) return null

  const detailed = sentences
  const synthetic = sentences.map((s) => shortenSentence(s, 16))

  const grouped = []
  for (let i = 0; i < synthetic.length; i += 2) {
    grouped.push(fuseSentencePair(synthetic[i], synthetic[i + 1] || '', 18))
  }

  const paragraphSummary = [shortenSentence(grouped.join(' '), 16)]
  const essence = [shortenSentence(paragraphSummary[0], 9)]

  return [
    { lines: detailed },
    { lines: synthetic.length ? synthetic : detailed },
    { lines: grouped.length ? grouped : synthetic },
    { lines: paragraphSummary },
    { lines: essence },
  ]
}

function loadUserDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((d) => d?.id && d?.title && Array.isArray(d?.levels))
  } catch {
    return []
  }
}

function saveUserDocs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userDocs))
}

function isHudMinimized() {
  return localStorage.getItem(HUD_MINIMIZED_KEY) === '1'
}

function applyHudState(minimized) {
  if (minimized) {
    hudPanelEl.classList.add('minimized')
    toggleHudBtn.textContent = 'Mostrar panel'
    localStorage.setItem(HUD_MINIMIZED_KEY, '1')
  } else {
    hudPanelEl.classList.remove('minimized')
    toggleHudBtn.textContent = 'Minimizar panel'
    localStorage.setItem(HUD_MINIMIZED_KEY, '0')
  }
}

function allDocs() {
  return [...baseDocs, ...userDocs]
}

function visibleDocs() {
  return allDocs().filter((doc) => visibleDocIds.has(doc.id))
}

function getAbstractionBlend(scale) {
  let baseIndex = ABSTRACTION_LEVELS.length - 1

  for (let i = 0; i < ABSTRACTION_LEVELS.length; i += 1) {
    if (scale >= ABSTRACTION_LEVELS[i].minScale) {
      baseIndex = i
      break
    }
  }

  const detailedIndex = Math.max(0, baseIndex - 1)
  const canBlend = baseIndex > 0

  if (!canBlend) {
    return { coarseIndex: 0, detailedIndex: 0, progress: 1, label: ABSTRACTION_LEVELS[0].label }
  }

  const low = ABSTRACTION_LEVELS[baseIndex].minScale
  const high = ABSTRACTION_LEVELS[baseIndex - 1].minScale
  const progress = clamp((scale - low) / (high - low), 0, 1)

  return {
    coarseIndex: baseIndex,
    detailedIndex,
    progress,
    label: `${ABSTRACTION_LEVELS[baseIndex].label} → ${ABSTRACTION_LEVELS[detailedIndex].label}`,
  }
}

function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - camera.x) / camera.scale,
    y: (screenY - camera.y) / camera.scale,
  }
}

function setScaleAroundPoint(nextScale, screenX, screenY) {
  const clamped = clamp(nextScale, camera.minScale, camera.maxScale)
  const world = screenToWorld(screenX, screenY)
  camera.scale = clamped
  camera.x = screenX - world.x * camera.scale
  camera.y = screenY - world.y * camera.scale
}

function resize() {
  dpr = Math.max(1, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

function drawGrid() {
  const left = (-camera.x) / camera.scale
  const top = (-camera.y) / camera.scale
  const right = left + window.innerWidth / camera.scale
  const bottom = top + window.innerHeight / camera.scale

  const step = 120
  const startX = Math.floor(left / step) * step
  const startY = Math.floor(top / step) * step

  ctx.lineWidth = 1 / camera.scale

  for (let x = startX; x <= right; x += step) {
    ctx.strokeStyle = x === 0 ? 'rgba(130,200,255,0.4)' : 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
  }

  for (let y = startY; y <= bottom; y += step) {
    ctx.strokeStyle = y === 0 ? 'rgba(130,200,255,0.4)' : 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }
}

function wrapText(text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  })

  if (current) lines.push(current)
  return lines
}

function drawParagraphCard(block, abstractionIndex, options = {}) {
  const level = block.levels[abstractionIndex]
  const alpha = options.alpha ?? 1
  const stageScale = options.stageScale ?? 1

  const textZoomFactor = Math.pow(camera.scale, 1.25)

  const padX = 24 / textZoomFactor
  const padY = 20 / textZoomFactor
  const titleSize = 24 / textZoomFactor
  const bodySize = 20 / textZoomFactor
  const lineGap = 9 / textZoomFactor
  const maxTextWidth = block.width - padX * 2

  ctx.save()
  ctx.font = `${bodySize}px Inter, system-ui, sans-serif`

  const wrappedParagraph = []
  level.lines.forEach((line) => {
    const wrapped = wrapText(line, maxTextWidth)
    wrappedParagraph.push(...wrapped)
    wrappedParagraph.push('')
  })
  if (wrappedParagraph.length > 0) wrappedParagraph.pop()

  const bodyLines = wrappedParagraph.length
  const cardHeight = padY * 2 + titleSize + 14 + bodyLines * (bodySize + lineGap)
  const centerX = block.x + block.width / 2
  const centerY = block.y + cardHeight / 2

  ctx.translate(centerX, centerY)
  ctx.scale(stageScale, stageScale)
  ctx.translate(-centerX, -centerY)

  ctx.globalAlpha = alpha
  ctx.fillStyle = block.color
  ctx.strokeStyle = block.border
  ctx.lineWidth = 2
  roundRect(ctx, block.x, block.y, block.width, cardHeight, 20)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#f1f5ff'
  ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`
  ctx.fillText(block.title, block.x + padX, block.y + padY + titleSize)

  ctx.fillStyle = '#d7e4ff'
  ctx.font = `${bodySize}px Inter, system-ui, sans-serif`
  let y = block.y + padY + titleSize + 18
  wrappedParagraph.forEach((line) => {
    if (!line) {
      y += bodySize * 0.55
      return
    }
    y += bodySize + lineGap
    ctx.fillText(line, block.x + padX, y)
  })

  ctx.restore()
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

function drawOriginMarker() {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2 / camera.scale
  ctx.beginPath()
  ctx.moveTo(-16, 0)
  ctx.lineTo(16, 0)
  ctx.moveTo(0, -16)
  ctx.lineTo(0, 16)
  ctx.stroke()
  ctx.restore()
}

function docsToBlocks(docs) {
  const width = 880
  const gapX = 120
  const gapY = 140
  const cols = 2

  return docs.map((doc, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const style = BLOCK_STYLES[index % BLOCK_STYLES.length]

    return {
      ...doc,
      x: 70 + col * (width + gapX),
      y: 120 + row * (520 + gapY),
      width,
      color: style.color,
      border: style.border,
    }
  })
}

function drawNoDocsHint() {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = 'rgba(230,240,255,0.9)'
  ctx.font = '16px Inter, sans-serif'
  ctx.fillText('No hay textos visibles. Marcá alguno en el panel izquierdo.', 24, 140)
  ctx.restore()
}

function render() {
  const blend = getAbstractionBlend(camera.scale)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

  ctx.setTransform(
    dpr * camera.scale,
    0,
    0,
    dpr * camera.scale,
    dpr * camera.x,
    dpr * camera.y,
  )

  drawGrid()
  drawOriginMarker()

  const raw = blend.progress
  const harsh = clamp((raw - 0.33) / 0.34, 0, 1)

  const outAlpha = Math.pow(1 - harsh, 2.8)
  const inAlpha = Math.pow(harsh, 0.85)

  const outgoingScale = 1 + 0.9 * harsh
  const incomingScale = 0.55 + 0.45 * harsh

  const blocks = docsToBlocks(visibleDocs())

  blocks.forEach((block) => {
    if (outAlpha > 0.01) {
      drawParagraphCard(block, blend.coarseIndex, {
        alpha: outAlpha,
        stageScale: outgoingScale,
      })
    }

    if (inAlpha > 0.01) {
      drawParagraphCard(block, blend.detailedIndex, {
        alpha: inAlpha,
        stageScale: incomingScale,
      })
    }
  })

  if (!blocks.length) drawNoDocsHint()

  cameraInfoEl.textContent = `${blend.label} · transición:${Math.round(
    blend.progress * 100,
  )}% · scale:${camera.scale.toFixed(3)} · x:${camera.x.toFixed(1)} y:${camera.y.toFixed(1)} · docs:${blocks.length}`

  requestAnimationFrame(render)
}

function renderDocList() {
  const docs = allDocs()
  docListEl.innerHTML = ''

  docs.forEach((doc) => {
    const row = document.createElement('label')
    row.className = 'docItem'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = visibleDocIds.has(doc.id)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) visibleDocIds.add(doc.id)
      else visibleDocIds.delete(doc.id)
    })

    const textWrap = document.createElement('span')
    const shortId = doc.id.startsWith('user-') ? 'usuario' : 'base'
    textWrap.innerHTML = `<strong>${doc.title}</strong><div class="meta">${shortId} · ${doc.levels[0].lines.length} líneas detalladas</div>`

    row.appendChild(checkbox)
    row.appendChild(textWrap)
    docListEl.appendChild(row)
  })
}

function handleSaveDoc() {
  const rawText = sourceInputEl.value.trim()
  if (!rawText) {
    saveStatusEl.textContent = 'Pegá un texto antes de guardar.'
    return
  }

  const levels = buildAbstractionLevelsFromText(rawText)
  if (!levels) {
    saveStatusEl.textContent = 'No pude procesar el texto.'
    return
  }

  const title = docTitleEl.value.trim() || 'Texto importado'
  const id = `user-${Date.now()}-${slugify(title).slice(0, 22) || 'texto'}`

  userDocs.push({ id, title, sourceText: rawText, levels })
  saveUserDocs()
  visibleDocIds.add(id)

  docTitleEl.value = ''
  sourceInputEl.value = ''
  saveStatusEl.textContent = 'Guardado en base local y disponible para visualizar.'

  renderDocList()
}

function canvasPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function getTwoPointers() {
  const values = Array.from(pointers.values())
  if (values.length < 2) return null
  return [values[0], values[1]]
}

function beginPinch() {
  const pair = getTwoPointers()
  if (!pair) return

  const [a, b] = pair
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2

  pinchState = {
    startDistance: distance,
    startScale: camera.scale,
    midWorld: screenToWorld(midX, midY),
  }
}

function updatePinch() {
  if (!pinchState) return

  const pair = getTwoPointers()
  if (!pair) return

  const [a, b] = pair
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2

  const ratio = distance / pinchState.startDistance
  camera.scale = clamp(pinchState.startScale * ratio, camera.minScale, camera.maxScale)
  camera.x = midX - pinchState.midWorld.x * camera.scale
  camera.y = midY - pinchState.midWorld.y * camera.scale
}

canvas.addEventListener('pointerdown', (event) => {
  const point = canvasPointFromEvent(event)
  pointers.set(event.pointerId, point)
  canvas.setPointerCapture(event.pointerId)

  if (pointers.size === 1) {
    dragPointerId = event.pointerId
    lastDrag = point
    canvas.classList.add('dragging')
  } else if (pointers.size === 2) {
    dragPointerId = null
    lastDrag = null
    canvas.classList.remove('dragging')
    beginPinch()
  }
})

canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return

  const point = canvasPointFromEvent(event)
  pointers.set(event.pointerId, point)

  if (pointers.size >= 2) {
    updatePinch()
    return
  }

  if (event.pointerId === dragPointerId && lastDrag) {
    camera.x += point.x - lastDrag.x
    camera.y += point.y - lastDrag.y
    lastDrag = point
  }
})

function endPointer(event) {
  pointers.delete(event.pointerId)

  if (event.pointerId === dragPointerId) {
    dragPointerId = null
    lastDrag = null
  }

  if (pointers.size < 2) pinchState = null

  if (pointers.size === 1) {
    const [id, point] = pointers.entries().next().value
    dragPointerId = id
    lastDrag = point
    canvas.classList.add('dragging')
  } else if (pointers.size === 0) {
    canvas.classList.remove('dragging')
  }
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const point = canvasPointFromEvent(event)
    const zoomFactor = Math.exp(-event.deltaY * 0.00135)
    setScaleAroundPoint(camera.scale * zoomFactor, point.x, point.y)
  },
  { passive: false },
)

saveDocBtn.addEventListener('click', handleSaveDoc)
toggleHudBtn.addEventListener('click', () => {
  applyHudState(!hudPanelEl.classList.contains('minimized'))
})

selectAllBtn.addEventListener('click', () => {
  visibleDocIds = new Set(allDocs().map((d) => d.id))
  renderDocList()
})

selectNoneBtn.addEventListener('click', () => {
  visibleDocIds = new Set()
  renderDocList()
})

window.addEventListener('resize', resize)

resize()
applyHudState(isHudMinimized())
renderDocList()
render()
