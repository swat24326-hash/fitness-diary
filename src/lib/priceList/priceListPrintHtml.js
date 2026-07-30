/**
 * HTML для печати прайса на 1× A4 альбом (чистая сборка строки).
 */

import {
  buildPriceListRows,
  getPriceListCell,
  normalizePriceListDocument,
  normalizePriceListMode,
} from './priceListCore.js'
import { formatPriceListMoney, priceListModePrintLabel } from './priceListExportCore.js'

/** @param {unknown} iso */
export function formatPriceListValidFromRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(iso ?? '').trim()
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * @param {unknown} text
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {object} doc
 * @param {{ mode?: string }} [opts]
 * @returns {string} полный HTML документ
 */
export function buildPriceListPrintHtml(doc, opts = {}) {
  const mode = normalizePriceListMode(opts.mode)
  const normalized = normalizePriceListDocument(doc, doc?.club_id)
  const tariffs = normalized.tariffs ?? []
  const rows = buildPriceListRows(normalized)
  const title = escapeHtml(normalized.meta?.title || 'Персональный зал')
  const modeLabel = escapeHtml(priceListModePrintLabel(mode))
  const address = escapeHtml(normalized.meta?.address || '')
  const phone = escapeHtml(normalized.meta?.phone || '')
  const validFrom = formatPriceListValidFromRu(normalized.valid_from)

  const metaBits = [
    validFrom ? `Цены с ${escapeHtml(validFrom)}` : '',
    address,
    phone,
  ].filter(Boolean)

  const headTariffs = tariffs
    .map((t) => {
      const code = escapeHtml(t.code || '')
      const vip = t.is_vip ? '<span class="vip">VIP</span>' : ''
      return `<th colspan="2" class="tariff${t.is_vip ? ' tariff-vip' : ''}"><span class="code">${code}</span>${vip}</th>`
    })
    .join('')

  const subHeads = tariffs
    .map(
      () =>
        `<th class="sub">Базовая</th><th class="sub sub-off">−10%</th>`,
    )
    .join('')

  const bodyRows = rows
    .map((row, ri) => {
      const showSessions = ri === 0 || rows[ri - 1].sessions !== row.sessions
      const cells = tariffs
        .map((t) => {
          const cell = getPriceListCell(normalized, {
            sessions: row.sessions,
            people: row.people,
            membershipTypeId: t.membership_type_id,
            mode,
          })
          return `<td class="num">${escapeHtml(formatPriceListMoney(cell.price_full))}</td><td class="num off">${escapeHtml(formatPriceListMoney(cell.price_10))}</td>`
        })
        .join('')
      return `<tr class="${ri % 2 ? 'alt' : ''}"><th class="axis">${showSessions ? escapeHtml(String(row.sessions)) : ''}</th><td class="axis">${escapeHtml(String(row.people))}</td>${cells}</tr>`
    })
    .join('')

  const colCount = 2 + tariffs.length * 2
  const emptyNote =
    tariffs.length === 0
      ? `<p class="empty">Нет колонок прайса — сначала сверните типы или импортируйте Excel.</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Прайс · ${modeLabel}</title>
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Segoe UI", system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 285mm;
      min-height: 198mm;
      max-height: 198mm;
      padding: 2mm 3mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 4mm;
      border-bottom: 0.45mm solid #111;
      padding-bottom: 1.5mm;
      flex-shrink: 0;
    }
    .head h1 {
      margin: 0;
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .head .mode {
      margin: 1mm 0 0;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #333;
    }
    .meta {
      max-width: 58%;
      text-align: right;
      font-size: 8pt;
      line-height: 1.35;
      color: #222;
    }
    .meta span { display: inline-block; margin-left: 4mm; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${tariffs.length > 6 ? '6.5pt' : tariffs.length > 4 ? '7pt' : '7.5pt'};
      line-height: 1.12;
      flex: 1 1 auto;
    }
    th, td {
      border: 0.25mm solid #9ca3af;
      padding: 0.7mm 0.5mm;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
    }
    thead th { background: #f3f4f6; font-weight: 700; }
    th.axis, td.axis {
      width: ${Math.max(9, 28 / Math.max(1, colCount))}%;
      font-weight: 700;
      background: #fafafa;
    }
    .tariff .code { font-size: 1.05em; }
    .vip {
      display: inline-block;
      margin-left: 1mm;
      padding: 0 1mm;
      border: 0.2mm solid #111;
      font-size: 0.75em;
      font-weight: 700;
    }
    .tariff-vip { background: #fffbeb; }
    .sub { font-size: 0.9em; font-weight: 600; color: #444; }
    .sub-off { color: #166534; }
    td.num { font-variant-numeric: tabular-nums; color: #374151; }
    td.off { font-weight: 800; color: #111; background: #f0fdf4; }
    tr.alt td, tr.alt th.axis { background: #f9fafb; }
    tr.alt td.off { background: #ecfdf5; }
    .empty { margin: 8mm 0; text-align: center; color: #666; font-size: 11pt; }
    .foot {
      flex-shrink: 0;
      font-size: 7pt;
      color: #6b7280;
      text-align: right;
    }
    @media print {
      html, body { width: 100%; height: auto; }
      .sheet {
        width: auto;
        min-height: 0;
        max-height: none;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      table { page-break-inside: avoid; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <div>
        <h1>${title}</h1>
        <p class="mode">${modeLabel}</p>
      </div>
      <div class="meta">${metaBits.map((b) => `<span>${b}</span>`).join('')}</div>
    </header>
    ${
      emptyNote ||
      `<table>
      <thead>
        <tr>
          <th rowspan="2" class="axis">Трен./мес</th>
          <th rowspan="2" class="axis">Людей</th>
          ${headTariffs}
        </tr>
        <tr>${subHeads}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`
    }
    <p class="foot">Прайс клуба · один лист A4 альбом</p>
  </div>
</body>
</html>`
}
