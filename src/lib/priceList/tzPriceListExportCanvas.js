/**
 * Печать и PNG прайса ТЗ — iframe + canvas, как у ПЗ.
 */

import { PRICE_LIST_TRAINER_PALETTE as C } from './priceListBrandColors.js'
import { formatPriceListMoney } from './priceListExportCore.js'
import { PRICE_LIST_A4_LANDSCAPE } from './priceListPrintLayout.js'
import {
  formatTzMonthsLabel,
  formatTzSessionsLabel,
  normalizeTzPriceListDocument,
} from './tzPriceListCore.js'
import {
  buildTzPriceListPngFileName,
  buildTzPriceListPrintBasement,
  buildTzPriceListPrintCap,
  buildTzPriceListPrintSheets,
} from './tzPriceListPrintChrome.js'
import { buildTzPriceListPrintHtml } from './tzPriceListPrintHtml.js'

/**
 * @param {object} doc
 * @param {{ sheet?: { slug: string, sheetLabel: string, kind: 'month1' | 'promo' }, sheetIndex?: number, sheetTotal?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderTzPriceListPng(doc, opts = {}) {
  if (typeof document === 'undefined') throw new Error('Только в браузере')
  const normalized = normalizeTzPriceListDocument(doc, doc?.club_id)
  const sheets = buildTzPriceListPrintSheets(normalized)
  const sheet = opts.sheet || sheets[0]
  if (!sheet) throw new Error('Сначала загрузите Excel / заполните сетку')

  const sheetIndex = opts.sheetIndex ?? 0
  const sheetTotal = opts.sheetTotal ?? sheets.length
  const { widthPx: width, heightPx: height } = PRICE_LIST_A4_LANDSCAPE
  const u = width / 100
  const type = {
    title: Math.round(u * 2.9),
    group: Math.round(u * 1.25),
    hours: Math.round(u * 0.85),
    club: Math.round(u * 0.95),
    phone: Math.round(u * 1.1),
    basement: Math.round(u * 1.15),
    foot: Math.round(u * 0.7),
  }

  const padX = Math.round(u * 2.2)
  const padTop = Math.round(u * 1.7)
  const padBottom = Math.round(u * 1.2)
  const headerH = Math.round(u * 7.4)
  const basementH = Math.round(u * 4.2)
  const footH = Math.round(u * 1.1)
  const bodyTop = padTop + headerH
  const bodyH = height - bodyTop - basementH - padBottom - footH
  const tableW = width - padX * 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(
    width * 0.72,
    height * 0.08,
    20,
    width * 0.72,
    height * 0.08,
    width * 0.55,
  )
  glow.addColorStop(0, 'rgba(46, 255, 184, 0.12)')
  glow.addColorStop(1, 'rgba(46, 255, 184, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  const meta = normalized.meta || {}
  const hoursNote =
    sheet.kind === 'month1'
      ? [meta.base_hours_note, meta.day_hours_note].filter(Boolean).join(' · ')
      : ''
  const cap = buildTzPriceListPrintCap(normalized, {
    sheetLabel: sheet.sheetLabel,
    hoursNote,
  })
  const basement = buildTzPriceListPrintBasement(normalized)

  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.font = `500 ${type.club}px "Segoe UI", system-ui, sans-serif`
  let clubY = padTop + type.club
  const clubLines = cap.addressLines.length ? cap.addressLines : cap.address ? [cap.address] : []
  for (const line of clubLines.slice(0, 3)) {
    ctx.fillText(truncate(ctx, line, width * 0.34), padX, clubY)
    clubY += type.club * 1.35
  }
  if (cap.phone) {
    ctx.fillStyle = C.accentBright
    ctx.font = `700 ${type.phone}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, cap.phone, width * 0.34), padX, clubY + type.phone * 0.2)
  }

  const titleY = padTop + type.title * 0.95
  const groupY = titleY + type.group * 1.35
  const hoursY = cap.hoursNote ? groupY + type.hours * 1.35 : groupY
  const ruleY = hoursY + Math.round(u * 1.2)

  ctx.textAlign = 'center'
  ctx.fillStyle = C.accentBright
  ctx.font = `800 ${type.title}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(truncate(ctx, cap.title, width * 0.52), width / 2, titleY)
  if (cap.sheetLabel) {
    ctx.fillStyle = C.accent
    ctx.font = `800 ${type.group}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(String(cap.sheetLabel).toUpperCase(), width / 2, groupY)
  }
  if (cap.hoursNote) {
    ctx.fillStyle = C.muted
    ctx.font = `500 ${type.hours}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, cap.hoursNote, width * 0.7), width / 2, hoursY)
  }

  ctx.strokeStyle = C.accent
  ctx.lineWidth = Math.max(2, Math.round(u * 0.1))
  ctx.beginPath()
  ctx.moveTo(padX, ruleY)
  ctx.lineTo(width - padX, ruleY)
  ctx.stroke()

  if (sheet.kind === 'promo') {
    drawPromoPanel(ctx, {
      x: padX,
      y: bodyTop,
      w: tableW,
      h: bodyH,
      rows: normalized.promo_rows ?? [],
      u,
    })
  } else {
    drawMonth1Panel(ctx, {
      x: padX,
      y: bodyTop,
      w: tableW,
      h: bodyH,
      rows: normalized.month1_rows ?? [],
      u,
    })
  }

  const baseY = bodyTop + bodyH + Math.round(u * 1.35)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = `700 ${type.basement}px "Segoe UI", system-ui, sans-serif`
  if (basement.oneTimeLine) {
    ctx.fillText(truncate(ctx, basement.oneTimeLine, width * 0.48), padX, baseY)
  }
  if (basement.clubCardLine) {
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, basement.clubCardLine, width * 0.38), width - padX, baseY)
  }
  if (basement.validLine) {
    ctx.textAlign = 'center'
    ctx.fillStyle = C.accentBright
    ctx.font = `700 ${type.basement}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(basement.validLine, width / 2, baseY + type.basement * 1.55)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = C.dim
  ctx.font = `500 ${type.foot}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(
    `Прайс ТЗ · A4 альбом · лист ${sheetIndex + 1}/${Math.max(1, sheetTotal)}`,
    width - padX,
    height - Math.round(u * 0.55),
  )

  return canvasToBlob(canvas)
}

/**
 * @param {object} doc
 * @returns {Promise<Array<{ blob: Blob, filename: string, sheetLabel: string }>>}
 */
export async function renderTzPriceListPngSheets(doc) {
  const normalized = normalizeTzPriceListDocument(doc, doc?.club_id)
  const sheets = buildTzPriceListPrintSheets(normalized)
  if (!sheets.length) throw new Error('Сначала загрузите Excel / заполните сетку')

  /** @type {Array<{ blob: Blob, filename: string, sheetLabel: string }>} */
  const out = []
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    const blob = await renderTzPriceListPng(doc, {
      sheet,
      sheetIndex: i,
      sheetTotal: sheets.length,
    })
    const filename = buildTzPriceListPngFileName({
      clubId: doc?.club_id,
      validFrom: doc?.valid_from,
      sheetSlug: sheet.slug,
    })
    out.push({ blob, filename, sheetLabel: sheet.sheetLabel })
  }
  return out
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadTzPriceListPngBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'tz-price.png'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * @param {object} doc
 */
export async function downloadTzPriceListPng(doc) {
  const sheets = await renderTzPriceListPngSheets(doc)
  for (let i = 0; i < sheets.length; i++) {
    const { blob, filename } = sheets[i]
    downloadTzPriceListPngBlob(blob, filename)
    if (i < sheets.length - 1) await sleep(350)
  }
  return {
    ok: true,
    filename: sheets.map((s) => s.filename).join(', '),
    count: sheets.length,
  }
}

/**
 * Печать через скрытый iframe + blob URL.
 * @param {object} doc
 */
export function printTzPriceListDocument(doc) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, error: 'Только в браузере' }
  }
  const sheets = buildTzPriceListPrintSheets(doc)
  if (!sheets.length) {
    return { ok: false, error: 'Сначала загрузите Excel / заполните сетку' }
  }

  const html = buildTzPriceListPrintHtml(doc)
  document.querySelectorAll('iframe[data-tz-price-list-print-frame]').forEach((el) => el.remove())

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('data-tz-price-list-print-frame', '1')
  iframe.setAttribute('title', 'Печать прайса ТЗ')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1123px;height:794px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url)
  }

  const runPrint = () => {
    const frameWin = iframe.contentWindow
    if (!frameWin) {
      cleanup()
      return
    }
    try {
      frameWin.focus()
      frameWin.print()
    } catch {
      cleanup()
      return
    }
    frameWin.addEventListener('afterprint', cleanup)
    setTimeout(cleanup, 120_000)
  }

  iframe.onload = () => {
    requestAnimationFrame(() => {
      setTimeout(runPrint, 80)
    })
  }
  iframe.src = url

  return { ok: true }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, rows: object[], u: number }} p
 */
function drawMonth1Panel(ctx, p) {
  const { x, y, w, h, rows, u } = p
  const cols = [
    { key: 'months', label: 'Срок', accent: false },
    { key: 'sessions', label: 'Тренировки', accent: false },
    { key: 'base_full', label: 'База полная', accent: false },
    { key: 'base_stand', label: 'База стенд', accent: true },
    { key: 'base_save', label: 'Экон.', accent: false },
    { key: 'day_stand', label: 'День стенд', accent: true },
    { key: 'day_save', label: 'Экон.', accent: false },
  ]
  drawGridPanel(ctx, { x, y, w, h, rows, cols, u, kind: 'month1' })
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, rows: object[], u: number }} p
 */
function drawPromoPanel(ctx, p) {
  const { x, y, w, h, rows, u } = p
  const cols = [
    { key: 'months', label: 'Срок', accent: false },
    { key: 'sessions', label: 'Тренировки', accent: false },
    { key: 'base_full', label: 'База', accent: false },
    { key: 'promo', label: 'Акция', accent: true },
    { key: 'save', label: 'Экономия', accent: false },
    { key: 'month_cost', label: '₽ / мес', accent: false },
  ]
  drawGridPanel(ctx, { x, y, w, h, rows, cols, u, kind: 'promo' })
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, rows: object[], cols: Array<{ key: string, label: string, accent: boolean }>, u: number, kind: string }} p
 */
function drawGridPanel(ctx, p) {
  const { x, y, w, h, rows, cols, u } = p
  const nRows = Math.max(1, rows.length)
  const nCols = cols.length
  const headH = Math.round(h * 0.16)
  const dataH = Math.max(1, h - headH)
  const rowH = dataH / nRows
  const colW = w / nCols

  const headFs = Math.round(Math.min(colW * 0.22, headH * 0.42, u * 1.05))
  const cellFs = Math.round(Math.min(colW * 0.28, rowH * 0.38, u * 1.35))
  const axisFs = Math.round(cellFs * 0.95)

  const grid = 'rgba(46, 255, 184, 0.52)'
  const gridStrong = 'rgba(46, 255, 184, 0.78)'
  const frame = 'rgba(46, 255, 184, 0.92)'
  const gridW = Math.max(1.75, Math.round(u * 0.08))
  const gridWStrong = Math.max(2.25, Math.round(u * 0.1))
  const frameW = Math.max(2.5, Math.round(u * 0.12))

  roundRect(ctx, x, y, w, h, Math.round(u * 0.55), C.card, null)

  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH - 2)

  ctx.textAlign = 'center'
  cols.forEach((col, i) => {
    const cx = x + i * colW + colW / 2
    if (col.key === 'months' || col.key === 'sessions') {
      ctx.fillStyle = 'rgba(6, 18, 16, 0.65)'
      ctx.fillRect(x + i * colW + 1, y + 1, colW - 1, headH - 2)
    }
    ctx.fillStyle = col.accent ? C.off : C.muted
    ctx.font = `700 ${headFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, col.label, colW - u * 0.6), cx, y + headH * 0.62)
  })

  strokeLine(ctx, x, y + headH, x + w, y + headH, gridStrong, gridWStrong)

  rows.forEach((row, ri) => {
    const rowY = y + headH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }

    cols.forEach((col, i) => {
      const cx = x + i * colW
      if (col.key === 'months' || col.key === 'sessions') {
        ctx.fillStyle = 'rgba(6, 18, 16, 0.45)'
        ctx.fillRect(cx + 1, rowY, colW - 1, rowH)
      } else if (col.accent) {
        ctx.fillStyle = ri % 2 === 1 ? 'rgba(46, 255, 184, 0.12)' : C.offBg
        ctx.fillRect(cx, rowY, colW, rowH)
      }

      const cy = rowY + rowH * 0.58
      const text = cellText(row, col.key)
      ctx.textAlign = 'center'
      if (col.key === 'months' || col.key === 'sessions') {
        ctx.fillStyle = C.text
        ctx.font = `800 ${axisFs}px "Segoe UI", system-ui, sans-serif`
      } else if (col.accent) {
        ctx.fillStyle = C.off
        ctx.font = `800 ${cellFs}px "Segoe UI", system-ui, sans-serif`
      } else if (col.key === 'base_save' || col.key === 'day_save' || col.key === 'save') {
        ctx.fillStyle = C.muted
        ctx.font = `600 ${cellFs}px "Segoe UI", system-ui, sans-serif`
      } else {
        ctx.fillStyle = C.full
        ctx.font = `600 ${cellFs}px "Segoe UI", system-ui, sans-serif`
      }
      ctx.fillText(truncate(ctx, text, colW - u * 0.5), cx + colW / 2, cy)
    })

    strokeLine(ctx, x, rowY + rowH, x + w, rowY + rowH, grid, gridW)
  })

  cols.forEach((_, i) => {
    if (i === 0) return
    strokeLine(ctx, x + i * colW, y, x + i * colW, y + h, gridStrong, gridWStrong)
  })

  ctx.strokeStyle = frame
  ctx.lineWidth = frameW
  ctx.strokeRect(x + frameW / 2, y + frameW / 2, w - frameW, h - frameW)
}

/**
 * @param {object} row
 * @param {string} key
 */
function cellText(row, key) {
  if (key === 'months') return formatTzMonthsLabel(row.months)
  if (key === 'sessions') return formatTzSessionsLabel(row.sessions)
  return formatPriceListMoney(row[key])
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncate(ctx, text, maxW) {
  let s = String(text ?? '')
  if (ctx.measureText(s).width <= maxW) return s
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s}…`
}

function strokeLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
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
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Не удалось создать PNG'))
    }, 'image/png')
  })
}
