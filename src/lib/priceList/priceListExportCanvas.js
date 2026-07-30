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
  // Единая шкала типографики от ширины листа (иерархия: title > code > price > sub)
  const u = width / 100
  const type = {
    title: Math.round(u * 2.9),
    subtitle: Math.round(u * 1.15),
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

  const cap = buildPriceListPrintCap(normalized, {
    mode,
    sheetLabel: sheet.sheetLabel,
  })
  const basement = buildPriceListPrintBasement(normalized)

  // Шапка: клуб слева, заголовок по центру
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

  // Центр: title → subtitle → VIP; линия всегда НИЖЕ текста (не через буквы)
  const titleY = padTop + type.title * 0.95
  const subtitleY = titleY + type.subtitle * 1.35
  const groupY = cap.sheetLabel ? subtitleY + type.group * 1.35 : subtitleY
  // Базовая линия текста + зазор — без Math.min вверх, иначе линия режет VIP
  const ruleY = (cap.sheetLabel ? groupY : subtitleY) + Math.round(u * 1.2)

  ctx.textAlign = 'center'
  ctx.fillStyle = C.accentBright
  ctx.font = `800 ${type.title}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(truncate(ctx, cap.title, width * 0.52), width / 2, titleY)
  ctx.fillStyle = C.text
  ctx.font = `600 ${type.subtitle}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(truncate(ctx, cap.subtitle, width * 0.52), width / 2, subtitleY)
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

  drawTariffPanel(ctx, {
    x: padX,
    y: bodyTop,
    w: tableW,
    h: bodyH,
    tariffs: sheet.tariffs,
    rows,
    normalized,
    mode,
    u,
  })

  // Подвал
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
    `Прайс клуба · A4 альбом · лист ${sheetIndex + 1}/${Math.max(1, sheetTotal)}`,
    width - padX,
    height - Math.round(u * 0.55),
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
 * @param {{ x: number, y: number, w: number, h: number, tariffs: object[], rows: object[], normalized: object, mode: string, u?: number }} p
 */
function drawTariffPanel(ctx, p) {
  const { x, y, w, h, tariffs, rows, normalized, mode } = p
  const u = p.u || w / 90
  const showPeople = shouldShowPriceListPeopleColumn(normalized)
  const nRows = Math.max(1, rows.length)
  const nTariffs = Math.max(1, tariffs.length)

  // Больше места шапке — VIP и «Базовая/−10%» не проигрывают цифрам
  const headH = Math.round(h * 0.2)
  const subH = Math.round(h * 0.11)
  const dataH = Math.max(1, h - headH - subH)
  const rowH = dataH / nRows

  const axisW = Math.round(Math.max(u * 3.6, Math.min(u * 4.6, w * 0.09)))
  const peopleW = showPeople ? Math.round(Math.max(u * 2.8, Math.min(u * 3.6, w * 0.07))) : 0
  const pairW = (w - axisW - peopleW) / nTariffs
  const halfW = pairW / 2

  // Иерархия: code ≥ priceOff > priceFull ≥ sub
  const codeFs = Math.round(Math.min(pairW * 0.22, headH * 0.48, u * 2.0))
  const subFs = Math.round(Math.min(halfW * 0.28, subH * 0.48, codeFs * 0.72))
  const priceOffFs = Math.round(Math.min(halfW * 0.34, rowH * 0.28, codeFs * 0.92))
  const priceFullFs = Math.round(priceOffFs * 0.82)
  const sessionFs = Math.round(Math.min(axisW * 0.42, rowH * 0.32, priceOffFs * 1.05))
  const peopleFs = Math.round(sessionFs * 0.85)
  const axisHeadFs = Math.round(Math.min(axisW * 0.22, headH * 0.22, subFs * 0.95))

  const grid = 'rgba(46, 255, 184, 0.52)'
  const gridStrong = 'rgba(46, 255, 184, 0.78)'
  const frame = 'rgba(46, 255, 184, 0.92)'
  const gridW = Math.max(1.75, Math.round(u * 0.08))
  const gridWStrong = Math.max(2.25, Math.round(u * 0.1))
  const frameW = Math.max(2.5, Math.round(u * 0.12))

  // Сначала заливка — рамку рисуем в конце, чтобы не «съедалась»
  roundRect(ctx, x, y, w, h, Math.round(u * 0.55), C.card, null)

  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH + subH - 2)

  ctx.fillStyle = 'rgba(6, 18, 16, 0.65)'
  ctx.fillRect(x + 1, y + 1, axisW - 1, headH + subH - 2)
  if (showPeople) {
    ctx.fillRect(x + axisW, y + 1, peopleW, headH + subH - 2)
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = `700 ${axisHeadFs}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Трен.', x + axisW / 2, y + headH * 0.4)
  ctx.fillText('/мес', x + axisW / 2, y + headH * 0.7)
  if (showPeople) {
    ctx.fillText('Людей', x + axisW + peopleW / 2, y + (headH + subH) * 0.55)
  }

  tariffs.forEach((t, i) => {
    const tx = x + axisW + peopleW + i * pairW
    ctx.fillStyle = t.is_vip ? C.vipHead : 'rgba(46, 255, 184, 0.1)'
    ctx.fillRect(tx, y + 1, pairW, headH - 1)
    ctx.fillStyle = t.is_vip ? C.vip : C.accentBright
    ctx.font = `800 ${codeFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, String(t.code || ''), pairW - u * 0.8), tx + pairW / 2, y + headH * 0.62)

    ctx.fillStyle = C.dim
    ctx.font = `600 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('Базовая', tx + halfW * 0.5, y + headH + subH * 0.68)
    ctx.fillStyle = C.off
    ctx.font = `700 ${subFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText('−10%', tx + halfW * 1.5, y + headH + subH * 0.68)
  })

  // Горизонтали шапки: под кодом карты и под «Базовая/−10%»
  strokeLine(ctx, x, y + headH, x + w, y + headH, gridStrong, gridWStrong)
  strokeLine(ctx, x, y + headH + subH, x + w, y + headH + subH, gridStrong, gridWStrong)

  rows.forEach((row, ri) => {
    const rowY = y + headH + subH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }

    ctx.fillStyle = 'rgba(6, 18, 16, 0.45)'
    ctx.fillRect(x + 1, rowY, axisW - 1, rowH)
    if (showPeople) {
      ctx.fillRect(x + axisW, rowY, peopleW, rowH)
    }

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

    strokeLine(ctx, x, rowY + rowH, x + w, rowY + rowH, grid, gridW)
  })

  strokeLine(ctx, x + axisW, y, x + axisW, y + h, gridStrong, gridWStrong)
  if (showPeople) {
    strokeLine(ctx, x + axisW + peopleW, y, x + axisW + peopleW, y + h, gridStrong, gridWStrong)
  }
  tariffs.forEach((_, i) => {
    const tx = x + axisW + peopleW + i * pairW
    // Вертикали колонок тарифов — ярче, чтобы рамка вокруг Br/Dm/El/Pl читалась
    strokeLine(ctx, tx, y, tx, y + h, gridStrong, gridWStrong)
    strokeLine(ctx, tx + halfW, y + headH, tx + halfW, y + h, grid, gridW)
  })

  // Явная рамка вокруг каждой ячейки с кодом карты (Br / Vip 1 …)
  tariffs.forEach((_, i) => {
    const tx = x + axisW + peopleW + i * pairW
    ctx.strokeStyle = frame
    ctx.lineWidth = gridWStrong
    ctx.strokeRect(tx + 0.5, y + 0.5, pairW - 1, headH - 1)
  })

  // Внешний контур поверх всего — не пропадает на краях
  ctx.strokeStyle = frame
  ctx.lineWidth = frameW
  ctx.strokeRect(x + frameW / 2, y + frameW / 2, w - frameW, h - frameW)
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
