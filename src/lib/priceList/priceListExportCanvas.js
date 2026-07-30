/**
 * PNG витрины прайса (canvas) — для стенда / мессенджера.
 * В шапке — адрес клуба из прайса, не бренд приложения.
 */

import {
  buildPriceListRows,
  getPriceListCell,
  normalizePriceListDocument,
  normalizePriceListMode,
} from './priceListCore.js'
import {
  buildPriceListPngFileName,
  formatPriceListMoney,
  priceListModePrintLabel,
} from './priceListExportCore.js'
import { buildPriceListPrintHtml } from './priceListPrintHtml.js'
import {
  PRICE_LIST_A4_LANDSCAPE,
  buildPriceListPrintSheets,
} from './priceListPrintLayout.js'
import { PRICE_LIST_TRAINER_PALETTE as C } from './priceListBrandColors.js'

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
  const padX = 48
  const padTop = 40
  const padBottom = 36
  const headerH = 128
  const footH = 28
  const bodyTop = padTop + headerH
  const bodyH = height - bodyTop - padBottom - footH
  const tableW = width - padX * 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)
  // Мягкое изумрудное свечение как у тренерского shell
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

  const title = String(normalized.meta?.title || 'Персональный зал').trim()
  ctx.fillStyle = C.accentBright
  ctx.font = '800 42px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(truncate(ctx, title, width * 0.52), padX, padTop + 34)

  ctx.fillStyle = C.muted
  ctx.font = '700 17px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(priceListModePrintLabel(mode).toUpperCase(), padX, padTop + 64)

  ctx.fillStyle = C.text
  ctx.font = '800 22px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(String(sheet.sheetLabel || 'Карты'), padX, padTop + 96)

  ctx.fillStyle = C.accent
  ctx.fillRect(padX, padTop + 108, 80, 3)

  const address = String(normalized.meta?.address ?? '').trim()
  const phone = String(normalized.meta?.phone ?? '').trim()
  const validFrom = String(normalized.valid_from ?? '').trim()
  ctx.textAlign = 'right'
  ctx.fillStyle = C.text
  ctx.font = '500 18px "Segoe UI", system-ui, sans-serif'
  let metaY = padTop + 28
  if (address) {
    ctx.fillText(truncate(ctx, address, width * 0.42), width - padX, metaY)
    metaY += 26
  }
  if (phone) {
    ctx.fillStyle = C.muted
    ctx.fillText(truncate(ctx, phone, width * 0.42), width - padX, metaY)
    metaY += 24
  }
  if (validFrom) {
    ctx.fillStyle = C.muted
    ctx.fillText(`Цены с ${formatDateRu(validFrom)}`, width - padX, metaY)
  }
  ctx.textAlign = 'left'

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

  ctx.textAlign = 'right'
  ctx.fillStyle = C.dim
  ctx.font = '500 15px "Segoe UI", system-ui, sans-serif'
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
  const headH = 56
  const subH = 30
  const axisW = Math.max(56, Math.min(78, w * 0.11))
  const peopleW = Math.max(48, Math.min(64, w * 0.09))
  const pairW = Math.max(72, (w - axisW - peopleW) / Math.max(1, tariffs.length))
  const dataH = Math.max(1, h - headH - subH)
  const rowH = dataH / Math.max(1, rows.length)

  roundRect(ctx, x, y, w, h, 14, C.card, C.border)
  ctx.fillStyle = C.headBg
  ctx.fillRect(x + 1, y + 1, w - 2, headH + subH - 2)

  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Трен.', x + axisW / 2, y + 24)
  ctx.fillText('/мес', x + axisW / 2, y + 42)
  ctx.fillText('Людей', x + axisW + peopleW / 2, y + 34)

  const codeFs = tariffs.length > 4 ? 15 : 18
  const priceFs = Math.max(12, Math.min(18, rowH * 0.38))
  tariffs.forEach((t, i) => {
    const tx = x + axisW + peopleW + i * pairW
    if (t.is_vip) {
      ctx.fillStyle = C.vipHead
      ctx.fillRect(tx, y + 1, pairW, headH - 1)
    }
    ctx.fillStyle = t.is_vip ? C.vip : C.accentBright
    ctx.font = `800 ${codeFs}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(truncate(ctx, String(t.code || ''), pairW - 10), tx + pairW / 2, y + 28)
    ctx.fillStyle = C.dim
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('баз.', tx + pairW * 0.25, y + headH + 18)
    ctx.fillStyle = C.off
    ctx.fillText('−10%', tx + pairW * 0.75, y + headH + 18)
  })

  rows.forEach((row, ri) => {
    const rowY = y + headH + subH + ri * rowH
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(x + 1, rowY, w - 2, rowH)
    }
    const cy = rowY + rowH * 0.62
    const showSessions = ri === 0 || rows[ri - 1].sessions !== row.sessions
    ctx.fillStyle = C.text
    ctx.font = `700 ${Math.max(13, priceFs)}px "Segoe UI", system-ui, sans-serif`
    ctx.fillText(showSessions ? String(row.sessions) : '', x + axisW / 2, cy)
    ctx.fillStyle = C.muted
    ctx.fillText(String(row.people), x + axisW + peopleW / 2, cy)

    tariffs.forEach((t, i) => {
      const cell = getPriceListCell(normalized, {
        sessions: row.sessions,
        people: row.people,
        membershipTypeId: t.membership_type_id,
        mode,
      })
      const tx = x + axisW + peopleW + i * pairW
      ctx.fillStyle = C.full
      ctx.font = `500 ${priceFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_full), tx + pairW * 0.25, cy)
      ctx.fillStyle = C.off
      ctx.font = `700 ${priceFs}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(formatPriceListMoney(cell.price_10), tx + pairW * 0.75, cy)
    })
  })
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

function formatDateRu(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[3]}.${m[2]}.${m[1]}`
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
