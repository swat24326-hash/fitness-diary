/**
 * PNG витрины прайса (canvas) — для стенда / мессенджера.
 * В шапке — адрес клуба из прайса, не бренд приложения.
 */

import {
  buildPriceListRows,
  getPriceListCell,
  normalizePriceListDocument,
  normalizePriceListMode,
  shouldShowPriceListPeopleColumn,
} from './priceListCore.js'
import {
  buildPriceListPngFileName,
  formatPriceListMoney,
} from './priceListExportCore.js'
import { buildPriceListPrintHtml } from './priceListPrintHtml.js'
import {
  PRICE_LIST_A4_LANDSCAPE,
  buildPriceListPrintSheets,
} from './priceListPrintLayout.js'
import { PRICE_LIST_TRAINER_PALETTE as C } from './priceListBrandColors.js'
import {
  buildPriceListPrintBasement,
  buildPriceListPrintCap,
} from './priceListPrintChrome.js'

/**
 * PNG одного листа A4 альбом (Карты или VIP).
 * @param {object} doc
 * @param {{ mode?: string, sheet?: { sheetLabel?: string, slug?: string, tariffs: object[] }, sheetIndex?: number, sheetTotal?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderPriceListPng(doc, opts = {}) {
  if (typeof document === 'undefined') throw new Error('Только в браузере')
  const mode = normalizePriceListMode(opts.mode)
  const normalized = normalizePriceListDocument(doc, doc?.club_id)
  const allTariffs = normalized.tariffs ?? []
  if (!allTariffs.length) throw new Error('Нет колонок прайса')

  const sheets = buildPriceListPrintSheets(allTariffs)
  const sheet = opts.sheet || sheets[0]
  if (!sheet?.tariffs?.length) throw new Error('Нет колонок прайса')

  const rows = buildPriceListRows(normalized)
  const sheetIndex = opts.sheetIndex ?? 0
  const sheetTotal = opts.sheetTotal ?? sheets.length

  const { widthPx: width, heightPx: height } = PRICE_LIST_A4_LANDSCAPE
  const padX = 56
  const padTop = 44
  const padBottom = 32
  const headerH = 132
  const basementH = 88
  const footH = 26
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

  const cap = buildPriceListPrintCap(normalized, {
    mode,
    sheetLabel: sheet.sheetLabel,
  })
  const basement = buildPriceListPrintBasement(normalized)

  // Шапка: клуб слева, заголовок по центру (как печать)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.font = '500 22px "Segoe UI", system-ui, sans-serif'
  let clubY = padTop + 26
  const clubLines = cap.addressLines.length ? cap.addressLines : cap.address ? [cap.address] : []
  for (const line of clubLines.slice(0, 3)) {
    ctx.fillText(truncate(ctx, line, width * 0.36), padX, clubY)
    clubY += 28
  }
  if (cap.phone) {
    ctx.fillStyle = C.accentBright
    ctx.font = '700 24px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(truncate(ctx, cap.phone, width * 0.36), padX, clubY + 6)
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = C.accentBright
  ctx.font = '800 48px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(truncate(ctx, cap.title, width * 0.5), width / 2, padTop + 42)
  ctx.fillStyle = C.text
  ctx.font = '600 24px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(truncate(ctx, cap.subtitle, width * 0.5), width / 2, padTop + 76)
  if (cap.sheetLabel) {
    ctx.fillStyle = C.accent
    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(String(cap.sheetLabel).toUpperCase(), width / 2, padTop + 110)
  }

  ctx.strokeStyle = C.accent
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(padX, padTop + headerH - 12)
  ctx.lineTo(width - padX, padTop + headerH - 12)
  ctx.stroke()

  drawTariffPanel(ctx, {
    x: padX,
    y: bodyTop,
    w: tableW,
    h: bodyH,
    tariffs: sheet.tariffs,
    rows,
    normalized,
    mode,
  })

  // Подвал как на печати
  const baseY = bodyTop + bodyH + 34
  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = '700 24px "Segoe UI", system-ui, sans-serif'
  if (basement.oneTimeLine) {
    ctx.fillText(truncate(ctx, basement.oneTimeLine, width * 0.5), padX, baseY)
  }
  if (basement.clubCardLine) {
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, basement.clubCardLine, width * 0.4), width - padX, baseY)
  }
  if (basement.validLine) {
    ctx.textAlign = 'center'
    ctx.fillStyle = C.accentBright
    ctx.font = '700 24px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(basement.validLine, width / 2, baseY + 38)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = C.dim
  ctx.font = '500 16px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(
    `Прайс клуба · A4 альбом · лист ${sheetIndex + 1}/${Math.max(1, sheetTotal)}`,
    width - padX,
    height - 14,
  )

  return canvasToBlob(canvas)
}

/**
 * Все листы PNG (Карты, VIP…).
 * @param {object} doc
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<Array<{ blob: Blob, filename: string, sheetLabel: string }>>}
 */
export async function renderPriceListPngSheets(doc, opts = {}) {
  const mode = normalizePriceListMode(opts.mode)
  const normalized = normalizePriceListDocument(doc, doc?.club_id)
  const sheets = buildPriceListPrintSheets(normalized.tariffs ?? [])
  if (!sheets.length) throw new Error('Нет колонок прайса')

  /** @type {Array<{ blob: Blob, filename: string, sheetLabel: string }>} */
  const out = []
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    const blob = await renderPriceListPng(doc, {
      mode,
      sheet,
      sheetIndex: i,
      sheetTotal: sheets.length,
    })
    const filename = buildPriceListPngFileName({
      clubId: doc?.club_id,
      mode,
      validFrom: doc?.valid_from,
      sheetSlug: sheet.slug,
    })
    out.push({ blob, filename, sheetLabel: sheet.sheetLabel })
  }
  return out
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, tariffs: object[], rows: object[], normalized: object, mode: string }} p
 */
function drawTariffPanel(ctx, p) {
  const { x, y, w, h, tariffs, rows, normalized, mode } = p
  const showPeople = shouldShowPriceListPeopleColumn(normalized)
  const nRows = Math.max(1, rows.length)
  const nTariffs = Math.max(1, tariffs.length)

  // Пропорции как на печати: шапка + строки на всю высоту, крупные цифры
  const headH = Math.max(64, Math.min(96, h * 0.16))
  const subH = Math.max(36, Math.min(48, h * 0.08))
  const dataH = Math.max(1, h - headH - subH)
  const rowH = dataH / nRows

  const axisW = Math.max(90, Math.min(120, w * 0.09))
  const peopleW = showPeople ? Math.max(72, Math.min(96, w * 0.07)) : 0
  const pairW = (w - axisW - peopleW) / nTariffs
  const halfW = pairW / 2

  const sessionFs = clamp(Math.round(rowH * 0.42), 28, 56)
  const peopleFs = clamp(Math.round(rowH * 0.34), 22, 44)
  const priceFullFs = clamp(Math.round(rowH * 0.32), 24, 48)
  const priceOffFs = clamp(Math.round(rowH * 0.4), 28, 56)
  const codeFs = clamp(Math.round(headH * 0.38), 22, 36)
  const subFs = clamp(Math.round(subH * 0.42), 14, 22)

  roundRect(ctx, x, y, w, h, 14, C.card, C.border)

  // Шапка тарифов
  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH + subH - 2)

  // Ось «Трен./мес»
  ctx.fillStyle = 'rgba(6, 18, 16, 0.65)'
  ctx.fillRect(x + 1, y + 1, axisW - 1, headH + subH - 2)
  if (showPeople) {
    ctx.fillRect(x + axisW, y + 1, peopleW, headH + subH - 2)
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = `700 ${Math.round(headH * 0.22)}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Трен.', x + axisW / 2, y + headH * 0.42)
  ctx.fillText('/мес', x + axisW / 2, y + headH * 0.72)
  if (showPeople) {
    ctx.fillText('Людей', x + axisW + peopleW / 2, y + (headH + subH) * 0.55)
  }

  tariffs.forEach((t, i) => {
    const tx = x + axisW + peopleW + i * pairW
    if (t.is_vip) {
      ctx.fillStyle = C.vipHead
      ctx.fillRect(tx, y + 1, pairW, headH - 1)
    }
    ctx.fillStyle = t.is_vip ? C.vip : C.accentBright
    ctx.font = `800 ${codeFs}px "Segoe UI", system-ui, sans-serif`
    const label = String(t.code || '')
    ctx.fillText(truncate(ctx, label, pairW - 16), tx + pairW / 2, y + headH * 0.58)

    ctx.fillStyle = C.dim
    ctx.font = `600 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('Базовая', tx + halfW * 0.5, y + headH + subH * 0.65)
    ctx.fillStyle = C.off
    ctx.font = `700 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('−10%', tx + halfW * 1.5, y + headH + subH * 0.65)
  })

  // Горизонталь под шапкой
  strokeLine(ctx, x, y + headH + subH, x + w, y + headH + subH, C.borderSoft, 1)

  rows.forEach((row, ri) => {
    const rowY = y + headH + subH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }

    // Фон оси
    ctx.fillStyle = 'rgba(6, 18, 16, 0.45)'
    ctx.fillRect(x + 1, rowY, axisW - 1, rowH)
    if (showPeople) {
      ctx.fillRect(x + axisW, rowY, peopleW, rowH)
    }

    // Фон колонок −10%
    tariffs.forEach((_, i) => {
      const tx = x + axisW + peopleW + i * pairW + halfW
      ctx.fillStyle = ri % 2 === 1 ? 'rgba(46, 255, 184, 0.12)' : C.offBg
      ctx.fillRect(tx, rowY, halfW, rowH)
    })

    const cy = rowY + rowH * 0.58
    const showSessions = ri === 0 || rows[ri - 1].sessions !== row.sessions
    ctx.textAlign = 'center'
    ctx.fillStyle = C.text
    ctx.font = `800 ${sessionFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(showSessions ? String(row.sessions) : '', x + axisW / 2, cy)
    if (showPeople) {
      ctx.fillStyle = C.muted
      ctx.font = `700 ${peopleFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(String(row.people), x + axisW + peopleW / 2, cy)
    }

    tariffs.forEach((t, i) => {
      const cell = getPriceListCell(normalized, {
        sessions: row.sessions,
        people: row.people,
        membershipTypeId: t.membership_type_id,
        mode,
      })
      const tx = x + axisW + peopleW + i * pairW
      ctx.fillStyle = C.full
      ctx.font = `600 ${priceFullFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_full), tx + halfW * 0.5, cy)
      ctx.fillStyle = C.off
      ctx.font = `800 ${priceOffFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_10), tx + halfW * 1.5, cy)
    })

    // Линия ряда
    strokeLine(ctx, x, rowY + rowH, x + w, rowY + rowH, C.borderSoft, 1)
  })

  // Вертикали колонок
  strokeLine(ctx, x + axisW, y, x + axisW, y + h, C.borderSoft, 1)
  if (showPeople) {
    strokeLine(ctx, x + axisW + peopleW, y, x + axisW + peopleW, y + h, C.borderSoft, 1)
  }
  tariffs.forEach((_, i) => {
    const tx = x + axisW + peopleW + i * pairW
    strokeLine(ctx, tx, y, tx, y + h, C.borderSoft, 1)
    strokeLine(ctx, tx + halfW, y + headH, tx + halfW, y + h, C.borderSoft, 1)
  })
  strokeLine(ctx, x + w, y, x + w, y + h, C.border, 1.5)
}

/** @param {number} n @param {number} min @param {number} max */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {string} color
 * @param {number} width
 */
function strokeLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadPriceListPngBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'price.png'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * @param {object} doc
 * @param {{ mode?: string }} [opts]
 */
export async function downloadPriceListPng(doc, opts = {}) {
  const sheets = await renderPriceListPngSheets(doc, opts)
  for (let i = 0; i < sheets.length; i++) {
    const { blob, filename } = sheets[i]
    downloadPriceListPngBlob(blob, filename)
    if (i < sheets.length - 1) await sleep(350)
  }
  return {
    ok: true,
    filename: sheets.map((s) => s.filename).join(', '),
    count: sheets.length,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Печать через скрытый iframe + blob URL (без window.open — он давал пустой белый лист).
 * @param {object} doc
 * @param {{ mode?: string }} [opts]
 */
export function printPriceListDocument(doc, opts = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, error: 'Только в браузере' }
  }
  if (!(doc?.tariffs ?? []).length) {
    return { ok: false, error: 'Нет колонок прайса для печати' }
  }

  document.body.classList.remove('price-list-printing')

  const html = buildPriceListPrintHtml(doc, opts)
  document.querySelectorAll('iframe[data-price-list-print-frame]').forEach((el) => el.remove())

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('data-price-list-print-frame', '1')
  iframe.setAttribute('title', 'Печать прайса')
  iframe.setAttribute('aria-hidden', 'true')
  // Не display:none и не 0×0 — иначе Chrome печатает пустой лист
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
    // Дать браузеру отрисовать таблицу до print()
    requestAnimationFrame(() => {
      setTimeout(runPrint, 80)
    })
  }
  iframe.src = url

  return { ok: true }
}

/** @deprecated */
export function printPriceListSurface() {
  return { ok: false, error: 'Устаревший вызов печати' }
}

function truncate(ctx, text, maxW) {
  let s = String(text ?? '')
  if (ctx.measureText(s).width <= maxW) return s
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s}…`
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
