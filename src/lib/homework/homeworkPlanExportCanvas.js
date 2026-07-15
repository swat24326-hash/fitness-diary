/**
 * PNG Stories для ДЗ: таблица упражнений.
 * В шапке — название клуба клиента + «Домашнее задание» (не бренд приложения).
 */

const WIDTH = 1080
const PADDING = 44
const CONTENT_W = WIDTH - PADDING * 2
const ROW_H = 56
const HEAD_H = 48

/** Emerald — как карточка клиента / рацион */
const C = {
  bg: '#07140f',
  bgSoft: '#0a1a14',
  card: '#0f1c18',
  cardBorder: 'rgba(52, 211, 153, 0.28)',
  accent: '#34d399',
  accentSoft: '#6ee7b7',
  accentNeon: '#2effb8',
  text: '#ecfdf5',
  textSoft: '#d1fae5',
  muted: '#94a3b8',
  dim: '#64748b',
  headBg: 'rgba(6, 78, 59, 0.65)',
  rowAlt: 'rgba(16, 185, 129, 0.07)',
  sectionBg: 'rgba(16, 185, 129, 0.12)',
  commentBg: 'rgba(16, 185, 129, 0.1)',
}

const COLS = [
  { key: 'n', title: '№', w: 0.08, align: 'center' },
  { key: 'name', title: 'Упражнение', w: 0.44, align: 'left' },
  { key: 'sets', title: 'Подх.', w: 0.12, align: 'center' },
  { key: 'reps', title: 'Повт.', w: 0.18, align: 'center' },
  { key: 'rest', title: 'Отдых', w: 0.18, align: 'center' },
]

/**
 * @param {import('./homeworkPlanCore.js').HomeworkDraft} draft
 * @param {{ clientName?: string, trainerName?: string, clubName?: string }} meta
 * @returns {Promise<Blob>}
 */
export async function renderHomeworkPlanPng(draft, meta = {}) {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  const comment = String(draft?.comment ?? '').trim()
  const planTitle = String(draft?.title ?? '').trim()
  const clubName = String(meta.clubName ?? '').trim() || 'Клуб'
  const clientName = String(meta.clientName ?? '').trim()
  const trainerName = String(meta.trainerName ?? '').trim()

  const flatRows = flattenRows(blocks)
  const height = estimateHeight(blocks, flatRows.length, comment, planTitle)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  paintBackground(ctx, height)

  let y = PADDING

  // Шапка: клуб + «Домашнее задание»
  ctx.fillStyle = C.accentNeon
  ctx.font = '800 36px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(truncateText(ctx, clubName, CONTENT_W), PADDING, y + 30)
  y += 48

  ctx.fillStyle = C.muted
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('ДОМАШНЕЕ ЗАДАНИЕ', PADDING, y + 18)
  y += 36

  ctx.fillStyle = C.accent
  ctx.fillRect(PADDING, y, 88, 4)
  y += 28

  if (planTitle) {
    ctx.fillStyle = C.text
    ctx.font = '800 40px "Segoe UI", system-ui, sans-serif'
    y = wrapText(ctx, planTitle, PADDING, y + 8, CONTENT_W, 46) + 12
  }

  if (clientName || trainerName) {
    const lines = []
    if (clientName) lines.push(clientName)
    if (trainerName) lines.push(`Тренер: ${trainerName}`)
    const metaH = 28 + lines.length * 34
    roundRect(ctx, PADDING, y, CONTENT_W, metaH, 14, C.card, C.cardBorder)
    let my = y + 34
    if (clientName) {
      ctx.fillStyle = C.accentSoft
      ctx.font = '700 26px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(truncateText(ctx, clientName, CONTENT_W - 40), PADDING + 20, my)
      my += 34
    }
    if (trainerName) {
      ctx.fillStyle = C.muted
      ctx.font = '500 22px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(truncateText(ctx, `Тренер: ${trainerName}`, CONTENT_W - 40), PADDING + 20, my)
    }
    y += metaH + 24
  }

  // Таблица по блокам
  let n = 0
  for (const block of blocks) {
    const exercises = Array.isArray(block?.exercises) ? block.exercises : []
    if (!exercises.length) continue

    const sectionLabel = String(block.label ?? 'Упражнения').trim() || 'Упражнения'
    const tableH = HEAD_H + exercises.length * ROW_H
    const cardH = 46 + tableH + 16

    roundRect(ctx, PADDING, y, CONTENT_W, cardH, 16, C.card, C.cardBorder)

    ctx.fillStyle = C.sectionBg
    ctx.fillRect(PADDING + 2, y + 2, CONTENT_W - 4, 40)
    ctx.fillStyle = C.accentSoft
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(truncateText(ctx, sectionLabel, CONTENT_W - 40), PADDING + 20, y + 30)

    const tableY = y + 46
    const innerX = PADDING + 12
    const innerW = CONTENT_W - 24
    drawTableHead(ctx, innerX, tableY, innerW)

    let rowY = tableY + HEAD_H
    exercises.forEach((ex, idx) => {
      n += 1
      if (idx % 2 === 1) {
        ctx.fillStyle = C.rowAlt
        ctx.fillRect(innerX, rowY, innerW, ROW_H)
      }
      drawDataRow(ctx, innerX, rowY, innerW, {
        n: String(n),
        name: String(ex.name ?? ''),
        sets: String(ex.sets ?? ''),
        reps: String(ex.reps ?? ''),
        rest: Number(ex.rest_sec) > 0 ? `${ex.rest_sec} с` : '—',
      })
      rowY += ROW_H
    })

    y += cardH + 18
  }

  if (comment) {
    ctx.font = '400 22px "Segoe UI", system-ui, sans-serif'
    const commentLines = measureWrapLines(ctx, comment, CONTENT_W - 48)
    const commentH = 58 + commentLines * 30 + 20
    roundRect(ctx, PADDING, y, CONTENT_W, commentH, 16, C.commentBg, C.cardBorder)
    ctx.fillStyle = C.accentSoft
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('Комментарий тренера', PADDING + 20, y + 34)
    ctx.fillStyle = C.textSoft
    ctx.font = '400 22px "Segoe UI", system-ui, sans-serif'
    wrapText(ctx, comment, PADDING + 20, y + 66, CONTENT_W - 40, 30)
    y += commentH + 16
  }

  ctx.fillStyle = C.dim
  ctx.font = '500 18px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(truncateText(ctx, `${clubName} · домашнее задание`, CONTENT_W), PADDING, height - 28)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Не удалось создать PNG'))
      else resolve(blob)
    }, 'image/png')
  })
}

function flattenRows(blocks) {
  const out = []
  for (const b of blocks ?? []) {
    for (const ex of b?.exercises ?? []) out.push(ex)
  }
  return out
}

function colLayout(innerW) {
  const widths = COLS.map((c) => Math.floor(innerW * c.w))
  const xs = [0]
  for (let i = 1; i < widths.length; i++) xs.push(xs[i - 1] + widths[i - 1])
  return { widths, xs }
}

function drawTableHead(ctx, x, y, width) {
  const { widths, xs } = colLayout(width)
  ctx.fillStyle = C.headBg
  ctx.fillRect(x, y, width, HEAD_H)
  ctx.font = '700 18px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = C.muted
  COLS.forEach((col, i) => {
    const cx = x + xs[i]
    const text = col.title
    if (col.align === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(text, cx + widths[i] / 2, y + 30)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(text, cx + 10, y + 30)
    }
  })
  ctx.textAlign = 'left'
}

function drawDataRow(ctx, x, y, width, row) {
  const { widths, xs } = colLayout(width)
  COLS.forEach((col, i) => {
    const raw = row[col.key] ?? ''
    const cx = x + xs[i]
    const maxW = widths[i] - 16
    ctx.font = col.key === 'name' ? '600 20px "Segoe UI", system-ui, sans-serif' : '500 20px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = col.key === 'name' ? C.text : C.textSoft
    const text = truncateText(ctx, String(raw), maxW)
    if (col.align === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(text, cx + widths[i] / 2, y + 36)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(text, cx + 10, y + 36)
    }
  })
  ctx.textAlign = 'left'
}

function paintBackground(ctx, height) {
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, C.bg)
  g.addColorStop(1, C.bgSoft)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WIDTH, height)

  const glow = ctx.createRadialGradient(WIDTH - 60, 40, 10, WIDTH - 100, 120, 320)
  glow.addColorStop(0, 'rgba(46, 255, 184, 0.1)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(WIDTH / 2, 0, WIDTH / 2, 360)
}

function estimateHeight(blocks, rowCount, comment, planTitle) {
  let h = PADDING + 160
  if (planTitle) h += 60
  h += 100
  for (const block of blocks ?? []) {
    const n = Array.isArray(block?.exercises) ? block.exercises.length : 0
    if (!n) continue
    h += 46 + HEAD_H + n * ROW_H + 16 + 18
  }
  if (!rowCount) h += 80
  const c = String(comment ?? '').trim()
  if (c) h += 90 + Math.ceil(c.length / 40) * 30
  h += 70
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
  const file = new File([blob], 'homework.png', { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return true
  }
  return false
}
