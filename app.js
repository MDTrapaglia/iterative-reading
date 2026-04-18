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
const AI_SUMMARY_ENDPOINT = 'api/summarize'
const PARAGRAPH_BREAK_TOKEN = '__PARA_BREAK__'
const TEXT_CLEANING_VERSION = 2
const AI_BACKEND_MAX_CHARS = 24000
const AI_DIRECT_SAFE_MAX_CHARS = 21000
const AI_CHUNK_MAX_CHARS = 9000
const AI_CHUNK_OVERLAP_UNITS = 1

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

function cleanImportedText(rawText) {
  let text = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00ad/g, '')

  text = text.replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n(?=[a-záéíóúüñ])/g, '$1')
  text = text.replace(/[ \t]+\n/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return paragraphs.join('\n\n')
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function expandParagraphsForReadability(paragraphs) {
  const expanded = []

  paragraphs.forEach((paragraph, idx) => {
    const sentenceCandidates = splitSentences(paragraph)
    const sentenceSource = sentenceCandidates.length ? sentenceCandidates : [paragraph]

    sentenceSource.forEach((sentence) => {
      expanded.push(...splitLongSentence(sentence, 24))
    })

    if (idx < paragraphs.length - 1) expanded.push(PARAGRAPH_BREAK_TOKEN)
  })

  return expanded
}

function splitLongSentence(sentence, maxWords = 24) {
  const words = sentence.split(' ').filter(Boolean)
  if (words.length <= maxWords) return [sentence]

  const clauseChunks = sentence
    .split(/[,;:]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (clauseChunks.length > 1) return clauseChunks

  const chunks = []
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '))
  }
  return chunks
}

function expandSentencesForReadability(sentences) {
  const expanded = []
  sentences.forEach((sentence) => {
    expanded.push(...splitLongSentence(sentence, 24))
  })
  return expanded
}

function tokenizeForRanking(text) {
  const stopwords = new Set([
    'de',
    'la',
    'el',
    'los',
    'las',
    'y',
    'o',
    'u',
    'en',
    'con',
    'para',
    'por',
    'un',
    'una',
    'unos',
    'unas',
    'del',
    'al',
    'que',
    'se',
    'su',
    'sus',
    'es',
    'son',
    'como',
    'más',
    'mas',
    'también',
    'entre',
    'desde',
    'hasta',
    'sobre',
    'sin',
    'ya',
    'muy',
    'este',
    'esta',
    'estos',
    'estas',
    'ese',
    'esa',
    'esos',
    'esas',
    'lo',
    'end',
  ])

  return (text.toLowerCase().match(/[a-záéíóúñü]{3,}/g) || []).filter((word) => !stopwords.has(word))
}

function rankSentencesByKeywords(sentences) {
  const frequency = new Map()

  sentences.forEach((sentence) => {
    tokenizeForRanking(sentence).forEach((word) => {
      frequency.set(word, (frequency.get(word) || 0) + 1)
    })
  })

  return sentences
    .map((sentence, index) => {
      const score = tokenizeForRanking(sentence).reduce((acc, word) => acc + (frequency.get(word) || 0), 0)
      return { sentence, index, score }
    })
    .sort((a, b) => b.score - a.score)
}

function pickRepresentativeLines(sentences, targetCount) {
  if (!sentences.length) return []
  if (sentences.length <= targetCount) return sentences

  const ranked = rankSentencesByKeywords(sentences)
  const selected = ranked
    .slice(0, targetCount)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)

  return selected
}

function buildEssenceLine(rawText, fallbackSentence) {
  const frequency = new Map()
  tokenizeForRanking(rawText).forEach((word) => {
    frequency.set(word, (frequency.get(word) || 0) + 1)
  })

  const keywords = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word)

  if (keywords.length >= 3) {
    const [a, b, c] = keywords
    return `En síntesis, el texto destaca ${a}, ${b} y ${c}.`
  }

  if (fallbackSentence) {
    const clean = fallbackSentence.replace(/\s+/g, ' ').trim()
    return clean.endsWith('.') ? clean : `${clean}.`
  }

  return 'En síntesis, el texto presenta una idea central clara.'
}

function buildAbstractionLevelsFromText(rawText) {
  const cleanedText = cleanImportedText(rawText)
  const paragraphs = splitParagraphs(cleanedText)
  if (!paragraphs.length) return null

  const sentencePool = paragraphs.flatMap((paragraph) => splitSentences(paragraph)).filter(Boolean)
  const sentenceSource = sentencePool.length ? sentencePool : paragraphs

  const detailed = expandParagraphsForReadability(paragraphs)

  const rankedCandidates = expandSentencesForReadability(sentenceSource)
  const syntheticTarget = clamp(Math.ceil(rankedCandidates.length * 0.7), 1, 8)
  const groupedTarget = clamp(Math.ceil(rankedCandidates.length * 0.4), 1, 5)

  const synthetic = pickRepresentativeLines(rankedCandidates, syntheticTarget)
  const grouped = pickRepresentativeLines(rankedCandidates, groupedTarget)

  const paragraphSummary = pickRepresentativeLines(rankedCandidates, 1)
  const essence = [buildEssenceLine(cleanedText, paragraphSummary[0])]

  return [
    { lines: detailed },
    { lines: synthetic.length ? synthetic : rankedCandidates },
    { lines: grouped.length ? grouped : synthetic },
    { lines: paragraphSummary.length ? paragraphSummary : grouped },
    { lines: essence },
  ]
}

function normalizeAiLevels(levels) {
  if (!Array.isArray(levels) || levels.length !== 5) return null

  const normalized = levels.map((level) => {
    const incomingLines = Array.isArray(level?.lines) ? level.lines : []
    const lines = []

    incomingLines.forEach((rawLine) => {
      const cleanLine = String(rawLine || '').replace(/\r\n?/g, '\n').trim()
      if (!cleanLine) return

      const splitByParagraph = cleanLine
        .split(/\n\s*\n/)
        .map((part) => part.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)

      splitByParagraph.forEach((part, idx) => {
        lines.push(part)
        if (idx < splitByParagraph.length - 1) lines.push(PARAGRAPH_BREAK_TOKEN)
      })
    })

    return { lines }
  })

  if (normalized.some((level) => level.lines.filter((line) => line !== PARAGRAPH_BREAK_TOKEN).length === 0)) {
    return null
  }
  return normalized
}

async function buildAbstractionLevelsWithAI(rawText, title) {
  const cleanedText = cleanImportedText(rawText)
  if (!cleanedText) throw new Error('empty_clean_text')

  const response = await fetch(AI_SUMMARY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanedText, title }),
  })

  if (!response.ok) {
    let errorPayload = null
    try {
      errorPayload = await response.json()
    } catch {
      errorPayload = null
    }

    const error = new Error(
      `ai_http_${response.status}${errorPayload?.error ? `_${errorPayload.error}` : ''}`,
    )
    error.httpStatus = response.status
    error.code = errorPayload?.error || null
    error.maxChars = Number(errorPayload?.max_chars) || null
    throw error
  }

  const payload = await response.json()
  const normalized = normalizeAiLevels(payload?.levels)
  if (!normalized) throw new Error('ai_invalid_schema')
  return normalized
}

function buildSafeLevels(seedLine = 'Sin contenido disponible.') {
  return [
    { lines: [seedLine] },
    { lines: [seedLine] },
    { lines: [seedLine] },
    { lines: [seedLine] },
    { lines: [seedLine] },
  ]
}

function splitLargeTextPiece(text, maxChars) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleanText) return []
  if (cleanText.length <= maxChars) return [cleanText]

  const sentences = splitSentences(cleanText)
  if (sentences.length > 1) {
    const pieces = []
    let buffer = ''

    sentences.forEach((sentence) => {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence
      if (candidate.length <= maxChars) {
        buffer = candidate
        return
      }

      if (buffer) pieces.push(buffer.trim())

      if (sentence.length <= maxChars) {
        buffer = sentence
        return
      }

      for (let i = 0; i < sentence.length; i += maxChars) {
        const part = sentence.slice(i, i + maxChars).trim()
        if (part) pieces.push(part)
      }
      buffer = ''
    })

    if (buffer) pieces.push(buffer.trim())
    return pieces.filter(Boolean)
  }

  const parts = []
  for (let i = 0; i < cleanText.length; i += maxChars) {
    const part = cleanText.slice(i, i + maxChars).trim()
    if (part) parts.push(part)
  }
  return parts
}

function chunkTextForAI(cleanedText, maxChars = AI_CHUNK_MAX_CHARS, overlapUnits = AI_CHUNK_OVERLAP_UNITS) {
  const paragraphs = splitParagraphs(cleanedText)
  const units = paragraphs.flatMap((paragraph) => splitLargeTextPiece(paragraph, maxChars))
  if (!units.length) return []

  const chunks = []
  let start = 0

  while (start < units.length) {
    let end = start
    let chunkText = ''

    while (end < units.length) {
      const candidate = chunkText ? `${chunkText}\n\n${units[end]}` : units[end]
      if (candidate.length > maxChars && chunkText) break
      chunkText = candidate
      end += 1
    }

    chunks.push({
      text: chunkText.trim(),
      startUnit: start,
      endUnit: end,
    })

    if (end >= units.length) break
    start = Math.max(end - overlapUnits, start + 1)
  }

  return chunks
}

function trimBreakEdges(lines) {
  const out = [...lines]
  while (out.length && out[0] === PARAGRAPH_BREAK_TOKEN) out.shift()
  while (out.length && out[out.length - 1] === PARAGRAPH_BREAK_TOKEN) out.pop()
  return out
}

function mergeLevelsFromChunkResults(chunkResults) {
  const levelLineLimits = [220, 120, 70, 30, 10]

  return Array.from({ length: 5 }, (_, levelIndex) => {
    const merged = []

    chunkResults.forEach((chunkResult, idx) => {
      const lines = Array.isArray(chunkResult?.levels?.[levelIndex]?.lines)
        ? chunkResult.levels[levelIndex].lines
        : []

      lines.forEach((line) => {
        const cleanLine = String(line || '').trim()
        if (!cleanLine) return

        if (cleanLine === PARAGRAPH_BREAK_TOKEN) {
          if (merged.length && merged[merged.length - 1] !== PARAGRAPH_BREAK_TOKEN) {
            merged.push(PARAGRAPH_BREAK_TOKEN)
          }
          return
        }

        if (merged[merged.length - 1] !== cleanLine) {
          merged.push(cleanLine)
        }
      })

      if (idx < chunkResults.length - 1 && merged.length && merged[merged.length - 1] !== PARAGRAPH_BREAK_TOKEN) {
        merged.push(PARAGRAPH_BREAK_TOKEN)
      }
    })

    const trimmed = trimBreakEdges(merged)
    const nonBreakLines = trimmed.filter((line) => line !== PARAGRAPH_BREAK_TOKEN)

    if (!nonBreakLines.length) {
      return { lines: ['Sin contenido disponible.'] }
    }

    if (nonBreakLines.length <= levelLineLimits[levelIndex]) {
      return { lines: trimmed }
    }

    return {
      lines: pickRepresentativeLines(nonBreakLines, levelLineLimits[levelIndex]),
    }
  })
}

async function summarizeWithChunking(cleanedText, title) {
  const chunks = chunkTextForAI(cleanedText)
  if (!chunks.length) {
    const heuristicLevels = buildAbstractionLevelsFromText(cleanedText) || buildSafeLevels()
    return {
      levels: heuristicLevels,
      summaryEngine: 'heuristic',
      usedAI: false,
      fallbackReason: 'chunking_no_units',
      fallbackMaxChars: null,
      chunkCount: 0,
      chunkAiCount: 0,
      chunkFallbackCount: 0,
      usedChunking: false,
    }
  }

  const chunkResults = []
  let chunkAiCount = 0
  let chunkFallbackCount = 0
  let fallbackReason = null
  let fallbackMaxChars = null

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunk = chunks[idx]
    saveStatusEl.textContent = `Procesando IA por bloques (${idx + 1}/${chunks.length})…`

    try {
      const levels = await buildAbstractionLevelsWithAI(chunk.text, `${title} · tramo ${idx + 1}/${chunks.length}`)
      chunkResults.push({ levels, engine: 'ai' })
      chunkAiCount += 1
    } catch (error) {
      fallbackReason = error?.code || error?.message || 'ai_error'
      fallbackMaxChars = Number(error?.maxChars) || null
      const heuristicLevels = buildAbstractionLevelsFromText(chunk.text) || buildSafeLevels()
      chunkResults.push({ levels: heuristicLevels, engine: 'heuristic' })
      chunkFallbackCount += 1
      console.warn('[iterative-reading] chunk summarize failed, fallback to heuristic', idx, error)
    }
  }

  let levels = null
  let usedReduceAI = false
  const reduceInput = chunkResults
    .map((chunkResult, idx) => {
      const lines = Array.isArray(chunkResult?.levels?.[3]?.lines) ? chunkResult.levels[3].lines : []
      return `Tramo ${idx + 1}: ${lines.filter((line) => line !== PARAGRAPH_BREAK_TOKEN).join(' ')}`
    })
    .join('\n\n')

  if (reduceInput.trim()) {
    try {
      saveStatusEl.textContent = 'Unificando resumen global con IA…'
      levels = await buildAbstractionLevelsWithAI(reduceInput, `${title} · síntesis global`)
      usedReduceAI = true
    } catch (error) {
      fallbackReason = fallbackReason || error?.code || error?.message || 'reduce_ai_error'
      console.warn('[iterative-reading] reduce summarize failed, fallback to merged chunks', error)
    }
  }

  if (!levels) {
    levels = mergeLevelsFromChunkResults(chunkResults)
  }

  const summaryEngine = usedReduceAI
    ? chunkFallbackCount === 0
      ? 'ai_chunked'
      : 'mixed_chunked'
    : chunkAiCount > 0
      ? 'mixed_chunked'
      : 'heuristic'

  return {
    levels,
    summaryEngine,
    usedAI: chunkAiCount > 0 || usedReduceAI,
    fallbackReason,
    fallbackMaxChars,
    chunkCount: chunks.length,
    chunkAiCount,
    chunkFallbackCount,
    usedChunking: true,
  }
}

async function summarizeDocumentWithPipeline(cleanedText, title) {
  if (cleanedText.length <= Math.min(AI_DIRECT_SAFE_MAX_CHARS, AI_BACKEND_MAX_CHARS)) {
    try {
      const levels = await buildAbstractionLevelsWithAI(cleanedText, title)
      return {
        levels,
        summaryEngine: 'ai',
        usedAI: true,
        fallbackReason: null,
        fallbackMaxChars: null,
        chunkCount: 1,
        chunkAiCount: 1,
        chunkFallbackCount: 0,
        usedChunking: false,
      }
    } catch (error) {
      const reason = error?.code || error?.message || 'ai_error'
      const maxChars = Number(error?.maxChars) || null

      if (reason !== 'text_too_long') {
        const heuristicLevels = buildAbstractionLevelsFromText(cleanedText) || buildSafeLevels()
        return {
          levels: heuristicLevels,
          summaryEngine: 'heuristic',
          usedAI: false,
          fallbackReason: reason,
          fallbackMaxChars: maxChars,
          chunkCount: 1,
          chunkAiCount: 0,
          chunkFallbackCount: 1,
          usedChunking: false,
        }
      }
    }
  }

  return summarizeWithChunking(cleanedText, title)
}

function loadUserDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const migrated = parsed
      .filter((d) => d?.id && d?.title && Array.isArray(d?.levels))
      .map((doc) => {
        const hasValidLevels =
          Array.isArray(doc.levels) &&
          doc.levels.length === 5 &&
          doc.levels.every(
            (level) =>
              Array.isArray(level?.lines) && level.lines.some((line) => String(line || '').trim().length > 0),
          )

        if (!hasValidLevels) {
          if (doc.sourceText) {
            const rebuilt = buildAbstractionLevelsFromText(doc.sourceText)
            if (rebuilt) {
              return {
                ...doc,
                levels: rebuilt,
                summaryEngine: doc.summaryEngine || 'heuristic',
              }
            }
          }

          const seedLine =
            (doc.levels || [])
              .flatMap((level) => (Array.isArray(level?.lines) ? level.lines : []))
              .map((line) => String(line || '').trim())
              .find(Boolean) || 'Sin contenido disponible.'

          const safeLevels = buildSafeLevels(seedLine)

          return {
            ...doc,
            levels: safeLevels,
            summaryEngine: doc.summaryEngine || 'heuristic',
          }
        }

        const hasLegacyEllipsis = doc.levels?.some((level) =>
          Array.isArray(level?.lines) && level.lines.some((line) => /…|\.\.\./.test(line)),
        )

        if (!hasLegacyEllipsis || !doc.sourceText) return doc

        const rebuiltLevels = buildAbstractionLevelsFromText(doc.sourceText)
        if (!rebuiltLevels) return doc

        return {
          ...doc,
          levels: rebuiltLevels,
        }
      })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return []
  }
}

function saveUserDocs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userDocs))
}

function shouldReprocessWithAI(doc) {
  if (!doc?.sourceText) return false
  const aiLikeEngines = new Set(['ai', 'ai_chunked', 'mixed_chunked'])
  if (!aiLikeEngines.has(doc.summaryEngine)) return true
  return (doc.textCleanVersion || 0) < TEXT_CLEANING_VERSION
}

async function reprocessLegacyDocsWithAI() {
  const candidates = userDocs.filter((doc) => shouldReprocessWithAI(doc))
  if (!candidates.length) return

  let updatedCount = 0
  saveStatusEl.textContent = `Reprocesando ${candidates.length} texto(s) previos con IA…`

  for (const doc of candidates) {
    try {
      const cleanedText = cleanImportedText(doc.sourceText)
      const summaryResult = await summarizeDocumentWithPipeline(cleanedText, doc.title)
      doc.sourceText = cleanedText
      doc.levels = summaryResult.levels
      doc.summaryEngine = summaryResult.summaryEngine
      doc.textCleanVersion = TEXT_CLEANING_VERSION
      updatedCount += 1
    } catch (error) {
      console.warn('[iterative-reading] no se pudo reprocesar doc con IA', doc?.title, error)
    }
  }

  if (updatedCount > 0) {
    saveUserDocs()
    renderDocList()
    saveStatusEl.textContent = `Reprocesado con IA: ${updatedCount}/${candidates.length} texto(s).`
    return
  }

  saveStatusEl.textContent = 'No se pudo reprocesar con IA los textos previos; se mantiene versión actual.'
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
  const hasFiniteRange = Number.isFinite(low) && Number.isFinite(high) && high > low
  const progress = hasFiniteRange ? clamp((scale - low) / (high - low), 0, 1) : 0

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
  const safeIndex = clamp(abstractionIndex, 0, Math.max(0, block.levels.length - 1))
  const level = block.levels[safeIndex] || { lines: ['Sin contenido disponible.'] }
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
    if (line === PARAGRAPH_BREAK_TOKEN) {
      wrappedParagraph.push(PARAGRAPH_BREAK_TOKEN)
      return
    }

    const wrapped = wrapText(line, maxTextWidth)
    wrappedParagraph.push(...wrapped)
    wrappedParagraph.push('')
  })
  if (wrappedParagraph.length > 0 && wrappedParagraph[wrappedParagraph.length - 1] === '') wrappedParagraph.pop()

  const bodyUnits = wrappedParagraph.reduce((acc, line) => {
    if (line === PARAGRAPH_BREAK_TOKEN) return acc + 1.8
    if (!line) return acc + 0.9
    return acc + 1
  }, 0)

  const cardHeight = padY * 2 + titleSize + 14 + bodyUnits * (bodySize + lineGap)
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
    if (line === PARAGRAPH_BREAK_TOKEN) {
      y += bodySize * 0.95
      ctx.save()
      ctx.strokeStyle = 'rgba(215,228,255,0.36)'
      ctx.lineWidth = 1.2 / textZoomFactor
      ctx.beginPath()
      ctx.moveTo(block.x + padX, y)
      ctx.lineTo(block.x + block.width - padX, y)
      ctx.stroke()
      ctx.restore()
      y += bodySize * 0.95
      return
    }

    if (!line) {
      y += bodySize * 0.7
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
    const detailedLineCount = (doc.levels?.[0]?.lines || []).filter((line) => line !== PARAGRAPH_BREAK_TOKEN).length
    textWrap.innerHTML = `<strong>${doc.title}</strong><div class="meta">${shortId} · ${detailedLineCount} líneas detalladas</div>`

    row.appendChild(checkbox)
    row.appendChild(textWrap)
    docListEl.appendChild(row)
  })
}

async function handleSaveDoc() {
  const rawText = sourceInputEl.value.trim()
  if (!rawText) {
    saveStatusEl.textContent = 'Pegá un texto antes de guardar.'
    return
  }

  const cleanedText = cleanImportedText(rawText)
  if (!cleanedText) {
    saveStatusEl.textContent = 'No pude limpiar el texto de entrada.'
    return
  }

  const title = docTitleEl.value.trim() || 'Texto importado'

  let levels = null
  let usedAI = false
  let summaryEngine = 'heuristic'
  let fallbackReason = null
  let fallbackMaxChars = null
  let chunkCount = 1
  let chunkAiCount = 0
  let chunkFallbackCount = 0
  let usedChunking = false

  saveStatusEl.textContent = 'Procesando resumen con IA…'

  const summaryResult = await summarizeDocumentWithPipeline(cleanedText, title)
  levels = summaryResult.levels
  usedAI = summaryResult.usedAI
  summaryEngine = summaryResult.summaryEngine
  fallbackReason = summaryResult.fallbackReason
  fallbackMaxChars = summaryResult.fallbackMaxChars
  chunkCount = summaryResult.chunkCount
  chunkAiCount = summaryResult.chunkAiCount
  chunkFallbackCount = summaryResult.chunkFallbackCount
  usedChunking = summaryResult.usedChunking

  if (!levels) {
    saveStatusEl.textContent = 'No pude procesar el texto.'
    return
  }

  const id = `user-${Date.now()}-${slugify(title).slice(0, 22) || 'texto'}`

  userDocs.push({
    id,
    title,
    sourceText: cleanedText,
    levels,
    summaryEngine,
    textCleanVersion: TEXT_CLEANING_VERSION,
  })
  saveUserDocs()
  visibleDocIds.add(id)

  docTitleEl.value = ''
  sourceInputEl.value = ''

  if (summaryEngine === 'ai') {
    saveStatusEl.textContent = 'Guardado con resumen por IA (Codex) en base local.'
  } else if (usedChunking && chunkCount > 1) {
    if (chunkFallbackCount === 0) {
      saveStatusEl.textContent = `Guardado con IA por bloques (${chunkCount} tramos) y síntesis global.`
    } else {
      saveStatusEl.textContent = `Guardado por bloques (${chunkAiCount}/${chunkCount} con IA, ${chunkFallbackCount} fallback heurístico).`
    }
  } else {
    saveStatusEl.textContent = usedAI
      ? 'Guardado con resumen mixto (IA + fallback local).'
      : String(fallbackReason).includes('text_too_long')
        ? `Guardado en base local (fallback heurístico: el texto supera el límite de ${
            fallbackMaxChars || 'la IA'
          } caracteres para IA).`
        : 'Guardado en base local (fallback heurístico por error de IA).'
  }

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
void reprocessLegacyDocsWithAI()
render()
