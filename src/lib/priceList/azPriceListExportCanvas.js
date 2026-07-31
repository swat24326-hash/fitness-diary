/**
 * Печать и PNG прайса АЗ — iframe + canvas, единый стандарт с ПЗ/ТЗ.
 */

import { PRICE_LIST_TRAINER_PALETTE as C } from './priceListBrandColors.js'
import { formatPriceListMoney } from './priceListExportCore.js'
import { PRICE_LIST_A4_LANDSCAPE } from './priceListPrintLayout.js'
import { getAzPriceListCell, normalizeAzPriceListDocument } from './azPriceListCore.js'
import {
  buildAzPriceListPngFileName,
  buildAzPriceListPrintBasement,
  buildAzPriceListPrintCap,
  buildAzPriceListPrintSheets,
} from './azPriceListPrintChrome.js'
import { buildAzPriceListPrintHtml } from './azPriceListPrintHtml.js'

/**
 * @param {object} doc
 * @param {{ sheet?: object, sheetIndex?: number, sheetTotal?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderAzPriceListPng(doc, opts = {}) {
  if (typeof document === 'undefined') throw new Error('Только в браузере')
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  const sheets = buildAzPriceListPrintSheets(normalized)
  const sheet = opts.sheet || sheets[0]
  if (!sheet) throw new Error('Сначала загрузите Excel / заполните сетку')

  const sheetIndex = opts.sheetIndex ?? 0
  const sheetTotal = opts.sheetTotal ?? sheets.length
  const { widthPx: width, heightPx: height } = PRICE_LIST_A4_LANDSCAPE
  const u = width / 100
  const type = {
    title: Math.round(u * 2.9),
    group: Math.round(u * 1.25),
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

  const cap = buildAzPriceListPrintCap(normalized, { sheetLabel: sheet.sheetLabel })
  const basement = buildAzPriceListPrintBasement(normalized)

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
  const ruleY = groupY + Math.round(u * 1.2)

  ctx.textAlign = 'center'
  ctx.fillStyle = C.accentBright
  ctx.font = `800 ${type.title}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(truncate(ctx, cap.title, width * 0.52), width / 2, titleY)
  if (cap.sheetLabel) {
    ctx.fillStyle = C.accent
    ctx.font = `800 ${type.group}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(String(cap.sheetLabel).toUpperCase(), width / 2, groupY)
  }

  ctx.strokeStyle = C.accent
  ctx.lineWidth = Math.max(2, Math.round(u * 0.1))
  ctx.beginPath()
  ctx.moveTo(padX, ruleY)
  ctx.lineTo(width - padX, ruleY)
  ctx.stroke()

  if (sheet.kind === 'fees') {
    drawFeesPanel(ctx, {
      x: padX,
      y: bodyTop,
      w: tableW,
      h: bodyH,
      normalized,
      u,
    })
  } else {
    const dirs =
      sheet.kind === 'classes' ? normalized.class_directions : normalized.result_directions
    drawDirectionsPanel(ctx, {
      x: padX,
      y: bodyTop,
      w: tableW,
      h: bodyH,
      directions: dirs,
      sessions: normalized.session_counts ?? [],
      normalized,
      u,
    })
  }

  const baseY = bodyTop + bodyH + Math.round(u * 1.35)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = `700 ${type.basement}px "Segoe UI", system-ui, sans-serif`
  if (basement.resultPlusLine) {
    ctx.fillText(truncate(ctx, basement.resultPlusLine, width * 0.48), padX, baseY)
  }
  if (basement.oneTimeLine) {
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, basement.oneTimeLine, width * 0.38), width - padX, baseY)
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
    `Прайс АЗ · A4 альбом · лист ${sheetIndex + 1}/${Math.max(1, sheetTotal)}`,
    width - padX,
    height - Math.round(u * 0.55),
  )

  return canvasToBlob(canvas)
}

/**
 * @param {object} doc
 */
export async function renderAzPriceListPngSheets(doc) {
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  const sheets = buildAzPriceListPrintSheets(normalized)
  if (!sheets.length) throw new Error('Сначала загрузите Excel / заполните сетку')

  /** @type {Array<{ blob: Blob, filename: string, sheetLabel: string }>} */
  const out = []
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    const blob = await renderAzPriceListPng(doc, {
      sheet,
      sheetIndex: i,
      sheetTotal: sheets.length,
    })
    const filename = buildAzPriceListPngFileName({
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
export function downloadAzPriceListPngBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'az-price.png'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * @param {object} doc
 */
export async function downloadAzPriceListPng(doc) {
  const sheets = await renderAzPriceListPngSheets(doc)
  for (let i = 0; i < sheets.length; i++) {
    const { blob, filename } = sheets[i]
    downloadAzPriceListPngBlob(blob, filename)
    if (i < sheets.length - 1) await sleep(350)
  }
  return {
    ok: true,
    filename: sheets.map((s) => s.filename).join(', '),
    count: sheets.length,
  }
}

/**
 * @param {object} doc
 */
export function printAzPriceListDocument(doc) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, error: 'Только в браузере' }
  }
  const sheets = buildAzPriceListPrintSheets(doc)
  if (!sheets.length) {
    return { ok: false, error: 'Сначала загрузите Excel / заполните сетку' }
  }

  const html = buildAzPriceListPrintHtml(doc)
  document.querySelectorAll('iframe[data-az-price-list-print-frame]').forEach((el) => el.remove())

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('data-az-price-list-print-frame', '1')
  iframe.setAttribute('title', 'Печать прайса АЗ')
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
 * @param {{ x: number, y: number, w: number, h: number, directions: object[], sessions: number[], normalized: object, u: number }} p
 */
function drawDirectionsPanel(ctx, p) {
  const { x, y, w, h, directions, sessions, normalized, u } = p
  const nDirs = Math.max(1, directions.length)
  const nRows = Math.max(1, sessions.length)
  const headH = Math.round(h * 0.2)
  const subH = Math.round(h * 0.11)
  const dataH = Math.max(1, h - headH - subH)
  const rowH = dataH / nRows
  const axisW = Math.round(Math.max(u * 3.6, Math.min(u * 4.6, w * 0.1)))
  const pairW = (w - axisW) / nDirs
  const halfW = pairW / 2

  const codeFs = Math.round(Math.min(pairW * 0.2, headH * 0.42, u * 1.6))
  const subFs = Math.round(Math.min(halfW * 0.28, subH * 0.48, codeFs * 0.72))
  const priceOffFs = Math.round(Math.min(halfW * 0.34, rowH * 0.32, codeFs * 0.95))
  const priceFullFs = Math.round(priceOffFs * 0.82)
  const sessionFs = Math.round(Math.min(axisW * 0.42, rowH * 0.36, priceOffFs * 1.05))

  const grid = 'rgba(46, 255, 184, 0.52)'
  const gridStrong = 'rgba(46, 255, 184, 0.78)'
  const frame = 'rgba(46, 255, 184, 0.92)'
  const gridW = Math.max(1.75, Math.round(u * 0.08))
  const gridWStrong = Math.max(2.25, Math.round(u * 0.1))
  const frameW = Math.max(2.5, Math.round(u * 0.12))

  roundRect(ctx, x, y, w, h, Math.round(u * 0.55), C.card, null)
  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH + subH - 2)
  ctx.fillStyle = 'rgba(6, 18, 16, 0.65)'
  ctx.fillRect(x + 1, y + 1, axisW - 1, headH + subH - 2)

  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = `700 ${Math.round(subFs * 0.95)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Трен.', x + axisW / 2, y + (headH + subH) * 0.55)

  directions.forEach((d, i) => {
    const tx = x + axisW + i * pairW
    ctx.fillStyle = 'rgba(46, 255, 184, 0.1)'
    ctx.fillRect(tx, y + 1, pairW, headH - 1)
    ctx.fillStyle = C.accentBright
    ctx.font = `800 ${codeFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, String(d.label || ''), pairW - u * 0.8), tx + pairW / 2, y + headH * 0.62)
    ctx.fillStyle = C.dim
    ctx.font = `600 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('Полная', tx + halfW * 0.5, y + headH + subH * 0.68)
    ctx.fillStyle = C.off
    ctx.font = `700 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('−10%', tx + halfW * 1.5, y + headH + subH * 0.68)
  })

  strokeLine(ctx, x, y + headH, x + w, y + headH, gridStrong, gridWStrong)
  strokeLine(ctx, x, y + headH + subH, x + w, y + headH + subH, gridStrong, gridWStrong)

  sessions.forEach((s, ri) => {
    const rowY = y + headH + subH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }
    ctx.fillStyle = 'rgba(6, 18, 16, 0.45)'
    ctx.fillRect(x + 1, rowY, axisW - 1, rowH)
    directions.forEach((_, i) => {
      const tx = x + axisW + i * pairW + halfW
      ctx.fillStyle = ri % 2 === 1 ? 'rgba(46, 255, 184, 0.12)' : C.offBg
      ctx.fillRect(tx, rowY, halfW, rowH)
    })

    const cy = rowY + rowH * 0.58
    ctx.textAlign = 'center'
    ctx.fillStyle = C.text
    ctx.font = `800 ${sessionFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(String(s), x + axisW / 2, cy)

    directions.forEach((d, i) => {
      const cell = getAzPriceListCell(normalized, { sessions: s, directionId: d.id })
      const tx = x + axisW + i * pairW
      ctx.fillStyle = C.full
      ctx.font = `600 ${priceFullFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_full), tx + halfW * 0.5, cy)
      ctx.fillStyle = C.off
      ctx.font = `800 ${priceOffFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_10), tx + halfW * 1.5, cy)
    })
    strokeLine(ctx, x, rowY + rowH, x + w, rowY + rowH, grid, gridW)
  })

  strokeLine(ctx, x + axisW, y, x + axisW, y + h, gridStrong, gridWStrong)
  directions.forEach((_, i) => {
    const tx = x + axisW + i * pairW
    strokeLine(ctx, tx, y, tx, y + h, gridStrong, gridWStrong)
    strokeLine(ctx, tx + halfW, y + headH, tx + halfW, y + h, grid, gridW)
  })
  ctx.strokeStyle = frame
  ctx.lineWidth = frameW
  ctx.strokeRect(x + frameW / 2, y + frameW / 2, w - frameW, h - frameW)
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, normalized: object, u: number }} p
 */
function drawFeesPanel(ctx, p) {
  const { x, y, w, h, normalized, u } = p
  const extras = normalized.extras || {}
  /** @type {Array<{ name: string, amount: number | null }>} */
  const rows = []
  if (extras.evening_pt_surcharge != null) {
    rows.push({
      name: 'Доплата ПТ по дневному абонементу вечером',
      amount: extras.evening_pt_surcharge,
    })
  }
  for (const f of extras.other_fees ?? []) {
    rows.push({ name: f.name, amount: f.amount })
  }
  const nRows = Math.max(1, rows.length)
  const headH = Math.round(h * 0.14)
  const rowH = Math.max(1, (h - headH) / nRows)
  const nameW = Math.round(w * 0.72)

  const grid = 'rgba(46, 255, 184, 0.52)'
  const frame = 'rgba(46, 255, 184, 0.92)'
  const gridW = Math.max(1.75, Math.round(u * 0.08))
  const frameW = Math.max(2.5, Math.round(u * 0.12))
  const nameFs = Math.round(Math.min(u * 1.2, rowH * 0.38))
  const amountFs = Math.round(nameFs * 1.05)

  roundRect(ctx, x, y, w, h, Math.round(u * 0.55), C.card, null)
  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH - 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.font = `700 ${nameFs}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Наименование', x + u * 1.2, y + headH * 0.62)
  ctx.textAlign = 'center'
  ctx.fillStyle = C.off
  ctx.fillText('Сумма', x + nameW + (w - nameW) / 2, y + headH * 0.62)
  strokeLine(ctx, x, y + headH, x + w, y + headH, grid, gridW)

  rows.forEach((r, ri) => {
    const rowY = y + headH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }
    ctx.fillStyle = ri % 2 === 1 ? 'rgba(46, 255, 184, 0.12)' : C.offBg
    ctx.fillRect(x + nameW, rowY, w - nameW, rowH)
    const cy = rowY + rowH * 0.58
    ctx.textAlign = 'left'
    ctx.fillStyle = C.text
    ctx.font = `600 ${nameFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, r.name, nameW - u * 2), x + u * 1.2, cy)
    ctx.textAlign = 'center'
    ctx.fillStyle = C.off
    ctx.font = `800 ${amountFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(formatPriceListMoney(r.amount), x + nameW + (w - nameW) / 2, cy)
    strokeLine(ctx, x, rowY + rowH, x + w, rowY + rowH, grid, gridW)
  })
  strokeLine(ctx, x + nameW, y, x + nameW, y + h, grid, gridW)
  ctx.strokeStyle = frame
  ctx.lineWidth = frameW
  ctx.strokeRect(x + frameW / 2, y + frameW / 2, w - frameW, h - frameW)
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
