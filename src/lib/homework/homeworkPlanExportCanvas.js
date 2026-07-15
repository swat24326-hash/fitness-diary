/**
 * Вертикальный PNG Stories для ДЗ.
 * Визуал ОТЛИЧЕН от рациона: энергия движения (янтарь / небо), не «тарелка» emerald.
 */

const WIDTH = 1080
const PADDING = 52
const CONTENT_W = WIDTH - PADDING * 2

/** Движение / заряд — тёплый янтарь + глубокий индиго-фон */
const C = {
  bgTop: '#1a1428',
  bgMid: '#12101c',
  bgBottom: '#0b1224',
  glow: 'rgba(251, 191, 36, 0.18)',
  glow2: 'rgba(56, 189, 248, 0.12)',
  card: 'rgba(30, 27, 45, 0.94)',
  cardBorder: 'rgba(251, 191, 36, 0.28)',
  accent: '#fbbf24',
  accentSoft: '#fde68a',
  accentDim: '#f59e0b',
  sky: '#38bdf8',
  text: '#f8fafc',
  textSoft: '#e2e8f0',
  muted: '#94a3b8',
  dim: '#64748b',
  chipBg: 'rgba(251, 191, 36, 0.14)',
  chipBorder: 'rgba(251, 191, 36, 0.4)',
  commentBg: 'rgba(56, 189, 248, 0.1)',
  commentBorder: 'rgba(56, 189, 248, 0.35)',
  bar: '#fbbf24',
}

/**
 * @param {import('./homeworkPlanCore.js').HomeworkDraft} draft
 * @param {{ clientName?: string, trainerName?: string }} meta
 * @returns {Promise<Blob>}
 */
export async function renderHomeworkPlanPng(draft, meta = {}) {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  const comment = String(draft?.comment ?? '').trim()
  const title = String(draft?.title ?? 'Домашнее задание').trim() || 'Домашнее задание'
  const clientName = String(meta.clientName ?? '').trim()
  const trainerName = String(meta.trainerName ?? '').trim()

  const height = estimateHeight(blocks, comment, title)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  paintBackground(ctx, height)

  let y = PADDING

  // Brand: wordmark + motion tag (не как рацион)
  ctx.fillStyle = C.accent
  ctx.beginPath()
  ctx.moveTo(PADDING, y + 8)
  ctx.lineTo(PADDING + 18, y + 28)
  ctx.lineTo(PADDING, y + 48)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = C.text
  ctx.font = '800 40px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('FIT-CITY', PADDING + 32, y + 36)
  y += 62

  ctx.fillStyle = C.sky
  ctx.font = '700 20px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('ДЗ  ·  ДОМАШНЯЯ ТРЕНИРОВКА', PADDING, y + 16)
  y += 40

  ctx.fillStyle = C.bar
  ctx.fillRect(PADDING, y, 96, 5)
  y += 30

  ctx.fillStyle = C.accentSoft
  ctx.font = '800 50px "Segoe UI", system-ui, sans-serif'
  y = wrapText(ctx, title, PADDING, y + 12, CONTENT_W, 56) + 16

  if (clientName || trainerName) {
    const metaH = 40 + (clientName ? 38 : 0) + (trainerName ? 32 : 0)
    roundRect(ctx, PADDING, y, CONTENT_W, metaH, 18, 'rgba(15, 23, 42, 0.55)', 'rgba(56, 189, 248, 0.28)')
    let my = y + 32
    if (clientName) {
      ctx.fillStyle = C.text
      ctx.font = '700 30px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(truncateText(ctx, clientName, CONTENT_W - 48), PADDING + 26, my)
      my += 38
    }
    if (trainerName) {
      ctx.fillStyle = C.muted
      ctx.font = '500 22px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(truncateText(ctx, `Тренер · ${trainerName}`, CONTENT_W - 48), PADDING + 26, my)
    }
    y += metaH + 28
  } else {
    y += 12
  }

  let exerciseNum = 0
  for (const block of blocks) {
    const exercises = Array.isArray(block?.exercises) ? block.exercises : []
    if (!exercises.length) continue

    const rowsH = exercises.reduce((sum, ex) => sum + exerciseRowHeight(ctx, ex), 0)
    const blockH = 68 + rowsH + 22
    roundRect(ctx, PADDING, y, CONTENT_W, blockH, 22, C.card, C.cardBorder)

    ctx.fillStyle = C.accentDim
    ctx.fillRect(PADDING, y + 20, 7, blockH - 40)

    ctx.fillStyle = C.accent
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(String(block.label ?? 'Блок').toUpperCase(), PADDING + 34, y + 44)

    let ey = y + 72
    for (const ex of exercises) {
      exerciseNum += 1
      const name = String(ex.name ?? '').trim()
      const nameMax = CONTENT_W - 130

      // number badge
      roundRect(ctx, PADDING + 30, ey - 10, 44, 36, 10, 'rgba(251, 191, 36, 0.18)', C.chipBorder)
      ctx.fillStyle = C.accentSoft
      ctx.font = '800 18px "Segoe UI", system-ui, sans-serif'
      const num = String(exerciseNum).padStart(2, '0')
      ctx.fillText(num, PADDING + 40, ey + 14)

      ctx.fillStyle = C.text
      ctx.font = '700 26px "Segoe UI", system-ui, sans-serif'
      const nameY = wrapText(ctx, name, PADDING + 88, ey + 12, nameMax, 32)

      const chip = formatExerciseChip(ex)
      ctx.font = '600 22px "Segoe UI", system-ui, sans-serif'
      const chipW = Math.min(CONTENT_W - 120, Math.max(220, ctx.measureText(chip).width + 40))
      const chipX = PADDING + 88
      const chipY = nameY + 12
      roundRect(ctx, chipX, chipY, chipW, 42, 14, C.chipBg, C.chipBorder)
      ctx.fillStyle = C.accentSoft
      ctx.fillText(chip, chipX + 18, chipY + 28)

      ey = chipY + 58
    }
    y += blockH + 22
  }

  if (comment) {
    ctx.font = '400 24px "Segoe UI", system-ui, sans-serif'
    const commentLines = measureWrapLines(ctx, comment, CONTENT_W - 64)
    const commentH = 72 + commentLines * 34 + 28
    roundRect(ctx, PADDING, y, CONTENT_W, commentH, 22, C.commentBg, C.commentBorder)
    ctx.fillStyle = C.sky
    ctx.font = '700 24px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('От тренера', PADDING + 28, y + 42)
    ctx.fillStyle = C.textSoft
    ctx.font = '400 24px "Segoe UI", system-ui, sans-serif'
    wrapText(ctx, comment, PADDING + 28, y + 80, CONTENT_W - 56, 34)
    y += commentH + 24
  }

  ctx.fillStyle = C.dim
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('FIT-CITY · сделай дома — приходи сильнее', PADDING, height - 36)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Не удалось создать PNG'))
      else resolve(blob)
    }, 'image/png')
  })
}

function formatExerciseChip(ex) {
  const sets = ex?.sets ?? 0
  const reps = String(ex?.reps ?? '').trim() || '—'
  const rest = Number(ex?.rest_sec) || 0
  return rest > 0 ? `${sets} × ${reps}   ·   отдых ${rest} с` : `${sets} × ${reps}`
}

function exerciseRowHeight(ctx, ex) {
  ctx.font = '700 26px "Segoe UI", system-ui, sans-serif'
  const name = String(ex?.name ?? '')
  const lines = measureWrapLines(ctx, name, CONTENT_W - 130)
  return 12 + lines * 32 + 12 + 42 + 18
}

function paintBackground(ctx, height) {
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, C.bgTop)
  g.addColorStop(0.5, C.bgMid)
  g.addColorStop(1, C.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, height)

  const glow = ctx.createRadialGradient(WIDTH * 0.2, 120, 10, WIDTH * 0.25, 200, 480)
  glow.addColorStop(0, C.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, 560)

  const glow2 = ctx.createRadialGradient(WIDTH * 0.9, height * 0.65, 20, WIDTH * 0.75, height * 0.7, 420)
  glow2.addColorStop(0, C.glow2)
  glow2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(WIDTH * 0.3, height * 0.4, WIDTH * 0.7, height * 0.6)
}

function estimateHeight(blocks, comment, title) {
  let h = PADDING + 240 + Math.ceil(String(title).length / 20) * 52
  h += 120
  for (const block of blocks ?? []) {
    const n = Array.isArray(block?.exercises) ? block.exercises.length : 0
    if (!n) continue
    h += 68 + n * 118 + 44
  }
  const c = String(comment ?? '').trim()
  if (c) h += 100 + Math.ceil(c.length / 36) * 34
  h += 100
  return Math.max(1920, h)
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function truncateText(ctx, text, maxWidth) {
  if (!text) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/).filter(Boolean)
  let line = ''
  let cy = y
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy)
      cy += lineHeight
      line = w
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, x, cy)
    cy += lineHeight
  }
  return cy
}

function measureWrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  let line = ''
  let lines = 1
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines++
      line = w
    } else {
      line = test
    }
  }
  return lines
}

/** @param {Blob} blob @param {string} filename */
export function downloadHomeworkPlanBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** @param {Blob} blob @param {string} title */
export async function shareHomeworkPlanBlob(blob, title) {
  const file = new File([blob], 'fit-city-homework.png', { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return true
  }
  return false
}
