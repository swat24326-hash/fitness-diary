/**
 * HTML для печати прайса на 1× A4 альбом — заполняет лист, при многих тарифах 2 панели.
 */

import {
  buildPriceListRows,
  getPriceListCell,
  normalizePriceListDocument,
  normalizePriceListMode,
} from './priceListCore.js'
import { formatPriceListMoney, priceListModePrintLabel } from './priceListExportCore.js'
import {
  priceListPrintFontPt,
  shouldSplitPriceListTariffs,
  splitPriceListTariffPanels,
} from './priceListPrintLayout.js'

/** @param {unknown} iso */
export function formatPriceListValidFromRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(iso ?? '').trim()
  return `${m[3]}.${m[2]}.${m[1]}`
}

/** @param {unknown} text */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {object} normalized
 * @param {object[]} tariffs
 * @param {Array<{ sessions: number, people: number }>} rows
 * @param {string} mode
 * @param {number} fontPt
 */
function buildTariffTableHtml(normalized, tariffs, rows, mode, fontPt) {
  const headTariffs = tariffs
    .map((t) => {
      const code = escapeHtml(t.code || '')
      const vip = t.is_vip ? '<span class="vip">VIP</span>' : ''
      return `<th colspan="2" class="tariff${t.is_vip ? ' tariff-vip' : ''}"><span class="code">${code}</span>${vip}</th>`
    })
    .join('')

  const subHeads = tariffs
    .map(() => `<th class="sub">Базовая</th><th class="sub sub-off">−10%</th>`)
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

  const rowPct = rows.length ? (100 / rows.length).toFixed(2) : '100'

  return `<table style="font-size:${fontPt}pt">
      <thead>
        <tr>
          <th rowspan="2" class="axis">Трен./мес</th>
          <th rowspan="2" class="axis">Людей</th>
          ${headTariffs}
        </tr>
        <tr>${subHeads}</tr>
      </thead>
      <tbody style="--row-h:${rowPct}%">${bodyRows}</tbody>
    </table>`
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

  const panels = splitPriceListTariffPanels(tariffs)
  const split = shouldSplitPriceListTariffs(tariffs)
  const maxTariffsInPanel = Math.max(1, ...panels.map((p) => p.length), 1)
  const fontPt = priceListPrintFontPt({
    tariffCount: maxTariffsInPanel,
    rowCount: rows.length,
    panels: panels.length || 1,
  })

  const emptyNote =
    tariffs.length === 0
      ? `<p class="empty">Нет колонок прайса — сначала сверните типы или импортируйте Excel.</p>`
      : ''

  const bodyHtml =
    emptyNote ||
    (split
      ? `<div class="panels panels--2">${panels
          .map(
            (panel) =>
              `<div class="panel">${buildTariffTableHtml(normalized, panel, rows, mode, fontPt)}</div>`,
          )
          .join('')}</div>`
      : `<div class="panels panels--1"><div class="panel">${buildTariffTableHtml(normalized, tariffs, rows, mode, fontPt)}</div></div>`)

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Прайс · ${modeLabel}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 281mm;
      height: 194mm;
      background: #fff;
      color: #111;
      font-family: "Segoe UI", system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 281mm;
      height: 194mm;
      padding: 3mm 4mm 2.5mm;
      display: flex;
      flex-direction: column;
      gap: 3mm;
      overflow: hidden;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 6mm;
      border-bottom: 0.5mm solid #111;
      padding-bottom: 2mm;
      flex-shrink: 0;
    }
    .head h1 {
      margin: 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .head .mode {
      margin: 1.2mm 0 0;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #333;
    }
    .meta {
      max-width: 52%;
      text-align: right;
      font-size: 9pt;
      line-height: 1.4;
      color: #222;
    }
    .meta span { display: block; }
    .panels {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      gap: 4mm;
      align-items: stretch;
    }
    .panels--1 { grid-template-columns: 1fr; }
    .panels--2 { grid-template-columns: 1fr 1fr; }
    .panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      line-height: 1.15;
    }
    thead { height: auto; }
    tbody tr { height: var(--row-h, auto); }
    th, td {
      border: 0.28mm solid #9ca3af;
      padding: 1.4mm 1mm;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
    }
    thead th { background: #f3f4f6; font-weight: 700; }
    th.axis, td.axis {
      width: 11%;
      font-weight: 700;
      background: #fafafa;
    }
    .tariff .code { font-size: 1.08em; }
    .vip {
      display: inline-block;
      margin-left: 1mm;
      padding: 0 1.2mm;
      border: 0.22mm solid #111;
      font-size: 0.72em;
      font-weight: 700;
    }
    .tariff-vip { background: #fffbeb; }
    .sub { font-size: 0.88em; font-weight: 600; color: #444; }
    .sub-off { color: #166534; }
    td.num { font-variant-numeric: tabular-nums; color: #374151; }
    td.off { font-weight: 800; color: #111; background: #f0fdf4; }
    tr.alt td, tr.alt th.axis { background: #f9fafb; }
    tr.alt td.off { background: #ecfdf5; }
    .empty { margin: auto; text-align: center; color: #666; font-size: 12pt; }
    .foot {
      flex-shrink: 0;
      font-size: 7.5pt;
      color: #6b7280;
      text-align: right;
      padding-top: 0.5mm;
    }
    @media print {
      html, body, .sheet {
        width: 281mm;
        height: 194mm;
      }
      .sheet {
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
    ${bodyHtml}
    <p class="foot">Прайс клуба · один лист A4 альбом${split ? ' · две панели' : ''}</p>
  </div>
</body>
</html>`
}
