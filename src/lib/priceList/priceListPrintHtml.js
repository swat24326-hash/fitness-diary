/**
 * HTML для печати прайса: отдельные листы A4 альбом (Карты / VIP), до 4 колонок на лист.
 */

import {
  buildPriceListRows,
  getPriceListCell,
  normalizePriceListDocument,
  normalizePriceListMode,
  shouldShowPriceListPeopleColumn,
} from './priceListCore.js'
import { formatPriceListMoney, priceListModePrintLabel } from './priceListExportCore.js'
import {
  buildPriceListPrintSheets,
  priceListPrintFontPt,
} from './priceListPrintLayout.js'
import { PRICE_LIST_TRAINER_PALETTE as P } from './priceListBrandColors.js'
import {
  buildPriceListPrintBasement,
  buildPriceListPrintCap,
} from './priceListPrintChrome.js'

/** Re-export для старых импортов verify / UI */
export { formatPriceListValidFromRu } from './priceListExportCore.js'

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
  const showPeople = shouldShowPriceListPeopleColumn(normalized)
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
      const peopleCell = showPeople
        ? `<td class="axis">${escapeHtml(String(row.people))}</td>`
        : ''
      return `<tr class="${ri % 2 ? 'alt' : ''}"><th class="axis">${showSessions ? escapeHtml(String(row.sessions)) : ''}</th>${peopleCell}${cells}</tr>`
    })
    .join('')

  const rowPct = rows.length ? (100 / rows.length).toFixed(2) : '100'
  const peopleHead = showPeople
    ? `<th rowspan="2" class="axis">Людей</th>`
    : ''

  return `<table style="font-size:${fontPt}pt">
      <thead>
        <tr>
          <th rowspan="2" class="axis">Трен./мес</th>
          ${peopleHead}
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
  const basement = buildPriceListPrintBasement(normalized)
  const sheets = buildPriceListPrintSheets(tariffs)
  const sheetTotal = sheets.length
  const modeLabel = escapeHtml(priceListModePrintLabel(mode))

  /**
   * @param {{ sheetLabel?: string }} [sheet]
   * @param {string} [pageLabel]
   * @param {string} [bodyInner]
   * @param {boolean} [withBreak]
   */
  function renderSheet(sheet, pageLabel, bodyInner, withBreak) {
    const cap = buildPriceListPrintCap(normalized, {
      mode,
      sheetLabel: sheet?.sheetLabel || '',
    })
    const addrHtml = (cap.addressLines.length ? cap.addressLines : cap.address ? [cap.address] : [])
      .map((line) => `<span class="cap-line">${escapeHtml(line)}</span>`)
      .join('')
    const phoneHtml = cap.phone
      ? `<span class="cap-phone">${escapeHtml(cap.phone)}</span>`
      : ''
    const basementHtml = basement.hasContent
      ? `<footer class="basement">
      <div class="basement-row">
        ${basement.oneTimeLine ? `<span>${escapeHtml(basement.oneTimeLine)}</span>` : ''}
        ${basement.clubCardLine ? `<span>${escapeHtml(basement.clubCardLine)}</span>` : ''}
      </div>
      ${basement.validLine ? `<p class="basement-valid">${escapeHtml(basement.validLine)}</p>` : ''}
    </footer>`
      : ''

    return `<section class="sheet${withBreak ? ' sheet--break' : ''}">
    <header class="cap">
      <div class="cap-club">
        ${addrHtml}
        ${phoneHtml}
      </div>
      <div class="cap-title">
        <h1>${escapeHtml(cap.title)}</h1>
        <p class="subtitle">${escapeHtml(cap.subtitle)}</p>
        ${cap.sheetLabel ? `<p class="group">${escapeHtml(cap.sheetLabel)}</p>` : ''}
      </div>
    </header>
    ${bodyInner}
    ${basementHtml}
    <p class="foot">Прайс клуба · A4 альбом${pageLabel ? ` · лист ${pageLabel}` : ''}</p>
  </section>`
  }

  const emptySheet = renderSheet(
    {},
    '',
    `<p class="empty">Нет колонок прайса — сначала сверните типы или импортируйте Excel.</p>`,
    false,
  )

  const sheetsHtml =
    sheetTotal === 0
      ? emptySheet
      : sheets
          .map((sheet, si) => {
            const fontPt = priceListPrintFontPt({
              tariffCount: sheet.tariffs.length,
              rowCount: rows.length,
            })
            const page = `${si + 1}/${sheetTotal}`
            const isLast = si === sheetTotal - 1
            return renderSheet(
              sheet,
              page,
              `<div class="table-wrap">${buildTariffTableHtml(normalized, sheet.tariffs, rows, mode, fontPt)}</div>`,
              !isLast,
            )
          })
          .join('')

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
      background: ${P.bg};
      color: ${P.text};
      font-family: "Segoe UI", system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 281mm;
      height: 194mm;
      padding: 3mm 5mm 2.5mm;
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
      background:
        radial-gradient(ellipse 55% 40% at 78% 0%, rgba(46, 255, 184, 0.12), transparent 70%),
        ${P.bg};
      color: ${P.text};
    }
    .sheet--break {
      page-break-after: always;
      break-after: page;
    }
    .cap {
      display: grid;
      grid-template-columns: 1.1fr 1.2fr;
      gap: 4mm;
      align-items: end;
      border-bottom: 0.45mm solid ${P.accent};
      padding-bottom: 2.2mm;
      flex-shrink: 0;
    }
    .cap-club {
      font-size: 9pt;
      line-height: 1.4;
      color: ${P.muted};
    }
    .cap-line { display: block; }
    .cap-phone {
      display: block;
      margin-top: 1mm;
      font-weight: 700;
      color: ${P.accentBright};
      text-decoration: underline;
      text-underline-offset: 1.2mm;
    }
    .cap-title { text-align: center; }
    .cap-title h1 {
      margin: 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.08;
      color: ${P.accentBright};
    }
    .cap-title .subtitle {
      margin: 1.2mm 0 0;
      font-size: 10pt;
      font-weight: 600;
      color: ${P.text};
    }
    .cap-title .group {
      margin: 1.4mm 0 0;
      font-size: 11pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${P.accent};
    }
    .table-wrap {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-radius: 3mm;
      border: 0.35mm solid ${P.border};
      background: ${P.card};
      overflow: hidden;
    }
    table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      line-height: 1.15;
    }
    tbody tr { height: var(--row-h, auto); }
    th, td {
      border: 0.22mm solid ${P.borderSoft};
      padding: 1.6mm 1mm;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
      color: ${P.text};
    }
    thead th { background: ${P.headBg}; font-weight: 700; color: ${P.muted}; }
    th.axis, td.axis {
      width: 10%;
      font-weight: 800;
      background: rgba(6, 18, 16, 0.65);
      font-size: 1.12em;
      color: ${P.text};
    }
    .tariff .code { font-size: 1.1em; color: ${P.accentBright}; }
    .vip {
      display: inline-block;
      margin-left: 1.2mm;
      padding: 0 1.4mm;
      border: 0.22mm solid ${P.accentBright};
      color: ${P.accentBright};
      font-size: 0.7em;
      font-weight: 700;
    }
    .tariff-vip { background: ${P.vipHead}; }
    .tariff-vip .code { color: ${P.vip}; }
    .sub { font-size: 0.88em; font-weight: 600; color: ${P.dim}; }
    .sub-off { color: ${P.off}; }
    td.num { font-variant-numeric: tabular-nums; color: ${P.full}; }
    td.off { font-weight: 800; color: ${P.off}; background: ${P.offBg}; }
    tr.alt td, tr.alt th.axis { background: ${P.rowAlt}; }
    tr.alt td.off { background: rgba(46, 255, 184, 0.12); }
    .basement {
      flex-shrink: 0;
      border-top: 0.35mm solid ${P.border};
      padding-top: 2mm;
      display: flex;
      flex-direction: column;
      gap: 1.2mm;
    }
    .basement-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 2mm 8mm;
      font-size: 10pt;
      font-weight: 700;
      color: ${P.text};
    }
    .basement-valid {
      margin: 0;
      text-align: center;
      font-size: 9pt;
      font-weight: 600;
      color: ${P.accentBright};
    }
    .empty {
      margin: auto;
      text-align: center;
      color: ${P.muted};
      font-size: 12pt;
    }
    .foot {
      flex-shrink: 0;
      font-size: 7.5pt;
      color: ${P.dim};
      text-align: right;
    }
    @media print {
      .sheet { width: 281mm; height: 194mm; }
      table { page-break-inside: avoid; break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`
}
