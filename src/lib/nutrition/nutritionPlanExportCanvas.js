/**
 * Рендер мерного рациона в PNG (canvas, без сторонних серверов).
 * @param {object} plan
 * @param {{ clientName?: string, goalKindLabel?: string, weightKg?: number | string }} meta
 * @returns {Promise<Blob>}
 */
import { buildDayProductSummary } from './nutritionPlanEditCore.js'

const WIDTH = 840
const PADDING = 28
const CONTENT_W = WIDTH - PADDING * 2
const ROW_H = 30
const CARD_PAD = 14
const CARD_GAP = 14
const TITLE_H = 28
const TABLE_HEAD_H = 28

const C = {
  bg: '#0a0e14',
  card: '#121a24',
  cardBorder: 'rgba(148, 163, 184, 0.22)',
  accent: '#34d399',
  accentSoft: '#6ee7b7',
  text: '#e2e8f0',
  textSoft: '#cbd5e1',
  muted: '#94a3b8',
  dim: '#64748b',
  rowAlt: 'rgba(30, 41, 59, 0.45)',
  headBg: 'rgba(51, 65, 85, 0.55)',
  summaryBg: 'rgba(16, 185, 129, 0.08)',
  summaryBorder: 'rgba(52, 211, 153, 0.35)',
  totalsBg: 'rgba(16, 185, 129, 0.14)',
  totalsBorder: 'rgba(52, 211, 153, 0.32)',
}

const MEAL_COLS = [
  { key: 'label', title: 'Продукт', align: 'left', weight: 0.36 },
  { key: 'portion', title: 'Порция', align: 'right', weight: 0.14 },
  { key: 'kcal', title: 'ккал', align: 'right', weight: 0.12 },
  { key: 'proteinG', title: 'Б', align: 'right', weight: 0.12 },
  { key: 'fatG', title: 'Ж', align: 'right', weight: 0.13 },
  { key: 'carbsG', title: 'У', align: 'right', weight: 0.13 },
]

const SUMMARY_COLS = [
  { key: 'label', title: 'Продукт', align: 'left', weight: 0.36 },
  { key: 'portion', title: 'Всего', align: 'right', weight: 0.14 },
  { key: 'kcal', title: 'ккал', align: 'right', weight: 0.12 },
  { key: 'proteinG', title: 'Б', align: 'right', weight: 0.12 },
  { key: 'fatG', title: 'Ж', align: 'right', weight: 0.13 },
  { key: 'carbsG', title: 'У', align: 'right', weight: 0.13 },
]

export async function renderNutritionPlanPng(plan, meta = {}) {
  const dayPlan = Array.isArray(plan?.dayPlan) ? plan.dayPlan : []
  const daySummary = buildDayProductSummary(plan)
  const height = estimateHeight(dayPlan, daySummary)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, WIDTH, height)

  let y = PADDING

  ctx.fillStyle = C.accent
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillText('FIT-CITY · Мерный рацион на день', PADDING, y + 18)
  y += 34

  if (meta.clientName) {
    ctx.fillStyle = C.accentSoft
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillText(String(meta.clientName), PADDING, y + 16)
    y += 28
  }

  const metaParts = []
  if (meta.weightKg != null && meta.weightKg !== '') metaParts.push(`вес ${meta.weightKg} кг`)
  if (meta.goalKindLabel) metaParts.push(meta.goalKindLabel)
  metaParts.push(
    `~${plan.kcalTarget} ккал · ${plan.mealsPerDay} приёма · Б ${plan.macros?.proteinG} Ж ${plan.macros?.fatG} У ${plan.macros?.carbsG}`,
  )
  ctx.fillStyle = C.muted
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(metaParts.join(' · '), PADDING, y + 14)
  y += 26

  if (plan.referents) {
    const ref = plan.referents
    const refLine = `Референты: ккал ${ref.kcal.min}–${ref.kcal.max} (цель ~${ref.kcal.aim}) · Б ${ref.protein.min}–${ref.protein.max} · Ж ${ref.fat.min}–${ref.fat.max} · У ${ref.carbs.min}–${ref.carbs.max} г`
    ctx.fillStyle = C.dim
    ctx.font = '13px system-ui, sans-serif'
    wrapText(ctx, refLine, PADDING, y + 12, CONTENT_W, 18)
    y += 34
  } else {
    y += 8
  }

  if (daySummary.length > 0) {
    const summaryRows = daySummary.map((row) => ({
      label: row.label,
      portion: row.portionLabel,
      kcal: row.kcal,
      proteinG: row.proteinG,
      fatG: row.fatG,
      carbsG: row.carbsG,
    }))
    y = drawTableCard(ctx, {
      title: 'Сводка на день',
      cols: SUMMARY_COLS,
      rows: summaryRows,
      y,
      accent: true,
    })
  }

  for (const meal of dayPlan) {
    const rows = (meal.items ?? []).map((item) => ({
      label: item.label,
      portion: item.portionLabel ?? `${item.grams} г`,
      kcal: item.kcal,
      proteinG: item.proteinG,
      fatG: item.fatG,
      carbsG: item.carbsG,
    }))
    const footer = meal.subtotal
      ? {
          label: 'Подытог',
          portion: '',
          kcal: meal.subtotal.kcal,
          proteinG: meal.subtotal.proteinG,
          fatG: meal.subtotal.fatG,
          carbsG: meal.subtotal.carbsG,
          bold: true,
        }
      : null
    y = drawTableCard(ctx, {
      title: meal.label ?? '',
      cols: MEAL_COLS,
      rows,
      footer,
      y,
    })
  }

  const tot = plan.totals
  if (tot) {
    const boxH = 52
    drawRoundedRect(ctx, PADDING, y, CONTENT_W, boxH, 12, C.totalsBg, C.totalsBorder)
    ctx.fillStyle = '#ecfdf5'
    ctx.font = 'bold 15px system-ui, sans-serif'
    const totalsLine = `Итого за день: ${tot.kcal} ккал (референт ~${plan.kcalTarget}) · Б ${tot.proteinG} · Ж ${tot.fatG} · У ${tot.carbsG}`
    ctx.fillText(totalsLine, PADDING + 14, y + 32)
    y += boxH + 14
  }

  ctx.fillStyle = C.dim
  ctx.font = '11px system-ui, sans-serif'
  const disc = plan.disclaimer ?? 'Ориентировочный рацион, не медицинское назначение.'
  wrapText(ctx, disc, PADDING, y + 10, CONTENT_W, 14)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Не удалось создать изображение'))
    }, 'image/png')
  })
}

function estimateHeight(dayPlan, daySummary) {
  let h = PADDING + 120
  if (daySummary.length > 0) {
    h += cardHeight(daySummary.length, true)
  }
  for (const meal of dayPlan) {
    h += cardHeight(meal.items?.length ?? 0, false, Boolean(meal.subtotal))
  }
  h += 90 + PADDING
  return h
}

function cardHeight(rowCount, accent, hasFooter = true) {
  const footerRows = hasFooter ? 1 : 0
  const tableH = TABLE_HEAD_H + (rowCount + footerRows) * ROW_H
  return TITLE_H + tableH + CARD_PAD * 2 + CARD_GAP + (accent ? 4 : 0)
}

function drawTableCard(ctx, { title, cols, rows, footer, y, accent = false }) {
  const rowCount = rows.length + (footer ? 1 : 0)
  const tableH = TABLE_HEAD_H + rowCount * ROW_H
  const cardH = TITLE_H + tableH + CARD_PAD * 2
  const bg = accent ? C.summaryBg : C.card
  const border = accent ? C.summaryBorder : C.cardBorder

  drawRoundedRect(ctx, PADDING, y, CONTENT_W, cardH, 12, bg, border)

  if (accent) {
    ctx.fillStyle = C.accentSoft
    ctx.fillRect(PADDING, y + 12, 3, cardH - 24)
  }

  ctx.fillStyle = C.accentSoft
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText(title, PADDING + CARD_PAD + (accent ? 6 : 0), y + CARD_PAD + 16)

  const tableY = y + CARD_PAD + TITLE_H
  const innerX = PADDING + CARD_PAD
  const innerW = CONTENT_W - CARD_PAD * 2
  drawTable(ctx, cols, rows, footer, innerX, tableY, innerW)
  return y + cardH + CARD_GAP
}

function drawTable(ctx, cols, rows, footer, x, y, width) {
  const colWidths = cols.map((c) => Math.floor(width * c.weight))
  const colX = [x]
  for (let i = 1; i < cols.length; i++) colX.push(colX[i - 1] + colWidths[i - 1])

  ctx.fillStyle = C.headBg
  ctx.fillRect(x, y, width, TABLE_HEAD_H)

  ctx.font = '500 12px system-ui, sans-serif'
  ctx.fillStyle = C.muted
  cols.forEach((col, i) => {
    const cellX = col.align === 'right' ? colX[i] + colWidths[i] - 8 : colX[i] + 8
    ctx.textAlign = col.align === 'right' ? 'right' : 'left'
    ctx.fillText(col.title, cellX, y + 19)
  })
  ctx.textAlign = 'left'

  let rowY = y + TABLE_HEAD_H
  rows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x, rowY, width, ROW_H)
    }
    drawTableRow(ctx, cols, colX, colWidths, row, rowY)
    rowY += ROW_H
  })

  if (footer) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.beginPath()
    ctx.moveTo(x, rowY)
    ctx.lineTo(x + width, rowY)
    ctx.stroke()
    drawTableRow(ctx, cols, colX, colWidths, { ...footer, bold: true }, rowY)
  }
}

function drawTableRow(ctx, cols, colX, colWidths, row, rowY) {
  cols.forEach((col, i) => {
    const raw = row[col.key]
    const text = raw == null || raw === '' ? '' : String(raw)
    const maxW = colWidths[i] - 12
    const clipped = truncateText(ctx, text, maxW)
    ctx.font = row.bold ? 'bold 13px system-ui, sans-serif' : '13px system-ui, sans-serif'
    ctx.fillStyle = row.bold ? C.text : C.textSoft
    const cellX = col.align === 'right' ? colX[i] + colWidths[i] - 8 : colX[i] + 8
    ctx.textAlign = col.align === 'right' ? 'right' : 'left'
    ctx.fillText(clipped, cellX, rowY + 20)
  })
  ctx.textAlign = 'left'
}

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function truncateText(ctx, text, maxWidth) {
  if (!text) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ')
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = w
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y)
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadNutritionPlanBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {Blob} blob
 * @param {string} title
 */
export async function shareNutritionPlanBlob(blob, title) {
  const file = new File([blob], 'fit-city-racion.png', { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return true
  }
  return false
}
