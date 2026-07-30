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

const PAD = 40
const AXIS_W = 88
const PEOPLE_W = 72
const PAIR_W = 168
const ROW_H = 44
const HEAD_H = 52
const SUB_H = 32

const C = {
  bg: '#0a0e12',
  card: '#121820',
  border: 'rgba(148, 163, 184, 0.28)',
  accent: '#38bdf8',
  accentSoft: '#7dd3fc',
  vip: '#fbbf24',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
  headBg: 'rgba(56, 189, 248, 0.12)',
  rowAlt: 'rgba(148, 163, 184, 0.06)',
  off: '#34d399',
  full: '#cbd5e1',
}

/**
 * @param {object} doc
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderPriceListPng(doc, opts = {}) {
  if (typeof document === 'undefined') throw new Error('Только в браузере')
  const mode = normalizePriceListMode(opts.mode)
  const normalized = normalizePriceListDocument(doc, doc?.club_id)
  const tariffs = normalized.tariffs ?? []
  if (!tariffs.length) throw new Error('Нет колонок прайса')

  const rows = buildPriceListRows(normalized)
  const tableW = AXIS_W + PEOPLE_W + tariffs.length * PAIR_W
  const width = Math.max(1080, PAD * 2 + tableW)
  const metaH = 150
  const height = PAD * 2 + metaH + HEAD_H + SUB_H + rows.length * ROW_H + 48

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)

  let y = PAD
  const title = String(normalized.meta?.title || 'Персональный зал').trim()
  ctx.fillStyle = C.accentSoft
  ctx.font = '800 34px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(truncate(ctx, title, width - PAD * 2), PAD, y + 28)
  y += 44

  ctx.fillStyle = C.muted
  ctx.font = '700 18px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(priceListModePrintLabel(mode).toUpperCase(), PAD, y + 14)
  y += 28

  ctx.fillStyle = C.accent
  ctx.fillRect(PAD, y, 72, 3)
  y += 18

  const address = String(normalized.meta?.address ?? '').trim()
  const phone = String(normalized.meta?.phone ?? '').trim()
  const validFrom = String(normalized.valid_from ?? '').trim()
  ctx.fillStyle = C.text
  ctx.font = '500 20px "Segoe UI", system-ui, sans-serif'
  if (address) {
    ctx.fillText(truncate(ctx, address, width - PAD * 2), PAD, y + 16)
    y += 28
  }
  const metaLine = [phone, validFrom ? `Цены с ${formatDateRu(validFrom)}` : '']
    .filter(Boolean)
    .join('  ·  ')
  if (metaLine) {
    ctx.fillStyle = C.muted
    ctx.font = '500 18px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(truncate(ctx, metaLine, width - PAD * 2), PAD, y + 14)
    y += 30
  }
  y += 8

  const tableX = PAD
  const tableTop = y
  const tableH = HEAD_H + SUB_H + rows.length * ROW_H
  roundRect(ctx, tableX, tableTop, tableW, tableH, 12, C.card, C.border)

  // header
  ctx.fillStyle = C.headBg
  ctx.fillRect(tableX + 1, tableTop + 1, tableW - 2, HEAD_H + SUB_H - 2)

  ctx.fillStyle = C.muted
  ctx.font = '700 14px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Трен.', tableX + AXIS_W / 2, tableTop + 28)
  ctx.fillText('/мес', tableX + AXIS_W / 2, tableTop + 46)
  ctx.fillText('Людей', tableX + AXIS_W + PEOPLE_W / 2, tableTop + 38)

  tariffs.forEach((t, i) => {
    const x = tableX + AXIS_W + PEOPLE_W + i * PAIR_W
    ctx.fillStyle = t.is_vip ? C.vip : C.text
    ctx.font = '800 18px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(truncate(ctx, String(t.code || ''), PAIR_W - 12), x + PAIR_W / 2, tableTop + 28)
    ctx.fillStyle = C.dim
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('баз.', x + PAIR_W * 0.25, tableTop + HEAD_H + 18)
    ctx.fillStyle = C.off
    ctx.fillText('−10%', x + PAIR_W * 0.75, tableTop + HEAD_H + 18)
  })

  let rowY = tableTop + HEAD_H + SUB_H
  rows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      ctx.fillStyle = C.rowAlt
      ctx.fillRect(tableX + 1, rowY, tableW - 2, ROW_H)
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = C.text
    ctx.font = '700 16px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(String(row.sessions), tableX + AXIS_W / 2, rowY + 28)
    ctx.fillStyle = C.muted
    ctx.fillText(String(row.people), tableX + AXIS_W + PEOPLE_W / 2, rowY + 28)

    tariffs.forEach((t, i) => {
      const cell = getPriceListCell(normalized, {
        sessions: row.sessions,
        people: row.people,
        membershipTypeId: t.membership_type_id,
        mode,
      })
      const x = tableX + AXIS_W + PEOPLE_W + i * PAIR_W
      ctx.fillStyle = C.full
      ctx.font = '500 15px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(formatPriceListMoney(cell.price_full), x + PAIR_W * 0.25, rowY + 28)
      ctx.fillStyle = C.off
      ctx.font = '700 16px "Segoe UI", system-ui, sans-serif'
      ctx.fillText(formatPriceListMoney(cell.price_10), x + PAIR_W * 0.75, rowY + 28)
    })
    rowY += ROW_H
  })

  ctx.textAlign = 'left'
  ctx.fillStyle = C.dim
  ctx.font = '500 14px "Segoe UI", system-ui, sans-serif'
  ctx.fillText('Прайс клуба · для стенда', PAD, height - 18)

  return canvasToBlob(canvas)
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
  const blob = await renderPriceListPng(doc, opts)
  const name = buildPriceListPngFileName({
    clubId: doc?.club_id,
    mode: opts.mode,
    validFrom: doc?.valid_from,
  })
  downloadPriceListPngBlob(blob, name)
  return { ok: true, filename: name }
}

/**
 * Печать: отдельное окно с HTML на 1× A4 альбом (без «пустой» первой страницы SPA).
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

  const html = buildPriceListPrintHtml(doc, opts)
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=780')
  if (!w) {
    return { ok: false, error: 'Разрешите всплывающие окна для печати' }
  }

  w.document.open()
  w.document.write(html)
  w.document.close()

  const runPrint = () => {
    try {
      w.focus()
      w.print()
    } catch {
      /* ignore */
    }
    // Закрываем после печати / отмены (Chrome шлёт afterprint)
    const closeLater = () => {
      try {
        w.close()
      } catch {
        /* ignore */
      }
    }
    w.addEventListener('afterprint', closeLater)
    setTimeout(closeLater, 60_000)
  }

  if (w.document.readyState === 'complete') {
    setTimeout(runPrint, 50)
  } else {
    w.addEventListener('load', () => setTimeout(runPrint, 50))
  }

  return { ok: true }
}

/** @deprecated используйте printPriceListDocument(doc, { mode }) */
export function printPriceListSurface() {
  return { ok: false, error: 'Вызовите печать из экрана прайса ещё раз' }
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
