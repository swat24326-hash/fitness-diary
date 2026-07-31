/**
 * HTML печати прайса АЗ: листы A4 альбом (Результат / Групповые / Доплаты).
 * Та же палитра и ритуал, что у ПЗ/ТЗ.
 */

import { PRICE_LIST_TRAINER_PALETTE as P } from './priceListBrandColors.js'
import { formatPriceListMoney } from './priceListExportCore.js'
import { getAzPriceListCell, normalizeAzPriceListDocument } from './azPriceListCore.js'
import {
  buildAzPriceListPrintBasement,
  buildAzPriceListPrintCap,
  buildAzPriceListPrintSheets,
} from './azPriceListPrintChrome.js'

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
 * @param {Array<{ id: string, label: string }>} directions
 */
function buildDirectionsTableHtml(normalized, directions) {
  const sessions = normalized.session_counts ?? []
  const headDirs = directions
    .map(
      (d) =>
        `<th colspan="2" class="tariff"><span class="code">${escapeHtml(d.label)}</span></th>`,
    )
    .join('')
  const subHeads = directions
    .map(() => `<th class="sub">Полная</th><th class="sub sub-off">−10%</th>`)
    .join('')

  const body = sessions
    .map((s, ri) => {
      const cells = directions
        .map((d) => {
          const cell = getAzPriceListCell(normalized, { sessions: s, directionId: d.id })
          return `<td class="num">${escapeHtml(formatPriceListMoney(cell.price_full))}</td><td class="num off">${escapeHtml(formatPriceListMoney(cell.price_10))}</td>`
        })
        .join('')
      return `<tr class="${ri % 2 ? 'alt' : ''}"><th class="axis">${escapeHtml(String(s))}</th>${cells}</tr>`
    })
    .join('')

  const rowPct = sessions.length ? (100 / sessions.length).toFixed(2) : '100'
  return `<table style="font-size:11pt">
    <thead>
      <tr>
        <th rowspan="2" class="axis">Трен.</th>
        ${headDirs}
      </tr>
      <tr>${subHeads}</tr>
    </thead>
    <tbody style="--row-h:${rowPct}%">${body}</tbody>
  </table>`
}

/**
 * @param {object} normalized
 */
function buildFeesTableHtml(normalized) {
  const extras = normalized.extras || {}
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
  const body = rows
    .map(
      (r, ri) =>
        `<tr class="${ri % 2 ? 'alt' : ''}"><td class="axis left">${escapeHtml(r.name)}</td><td class="num off">${escapeHtml(formatPriceListMoney(r.amount))}</td></tr>`,
    )
    .join('')
  const rowPct = rows.length ? (100 / rows.length).toFixed(2) : '100'
  return `<table style="font-size:12pt">
    <thead>
      <tr>
        <th class="axis left">Наименование</th>
        <th class="sub-off">Сумма</th>
      </tr>
    </thead>
    <tbody style="--row-h:${rowPct}%">${body || '<tr><td colspan="2" class="empty">Нет доплат</td></tr>'}</tbody>
  </table>`
}

/**
 * @param {object} doc
 * @returns {string}
 */
export function buildAzPriceListPrintHtml(doc) {
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  const basement = buildAzPriceListPrintBasement(normalized)
  const sheets = buildAzPriceListPrintSheets(normalized)
  const sheetTotal = sheets.length

  /**
   * @param {{ sheetLabel?: string, kind?: string }} sheet
   * @param {string} pageLabel
   * @param {string} bodyInner
   * @param {boolean} withBreak
   */
  function renderSheet(sheet, pageLabel, bodyInner, withBreak) {
    const cap = buildAzPriceListPrintCap(normalized, { sheetLabel: sheet?.sheetLabel || '' })
    const addrHtml = (cap.addressLines.length ? cap.addressLines : cap.address ? [cap.address] : [])
      .map((line) => `<span class="cap-line">${escapeHtml(line)}</span>`)
      .join('')
    const phoneHtml = cap.phone
      ? `<span class="cap-phone">${escapeHtml(cap.phone)}</span>`
      : ''
    const basementHtml = basement.hasContent
      ? `<footer class="basement">
      <div class="basement-row">
        ${basement.resultPlusLine ? `<span>${escapeHtml(basement.resultPlusLine)}</span>` : ''}
        ${basement.oneTimeLine ? `<span>${escapeHtml(basement.oneTimeLine)}</span>` : ''}
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
        ${cap.sheetLabel ? `<p class="group">${escapeHtml(cap.sheetLabel)}</p>` : ''}
      </div>
    </header>
    ${bodyInner}
    ${basementHtml}
    <p class="foot">Прайс АЗ · A4 альбом${pageLabel ? ` · лист ${pageLabel}` : ''}</p>
  </section>`
  }

  const emptySheet = renderSheet(
    {},
    '',
    `<p class="empty">Сначала загрузите Excel или заполните сетку.</p>`,
    false,
  )

  const sheetsHtml =
    sheetTotal === 0
      ? emptySheet
      : sheets
          .map((sheet, si) => {
            const page = `${si + 1}/${sheetTotal}`
            const isLast = si === sheetTotal - 1
            let table = ''
            if (sheet.kind === 'fees') table = buildFeesTableHtml(normalized)
            else if (sheet.kind === 'classes') {
              table = buildDirectionsTableHtml(normalized, normalized.class_directions)
            } else {
              table = buildDirectionsTableHtml(normalized, normalized.result_directions)
            }
            return renderSheet(sheet, page, `<div class="table-wrap">${table}</div>`, !isLast)
          })
          .join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Прайс АЗ</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: ${P.bg}; color: ${P.text};
      font-family: "Segoe UI", system-ui, sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet {
      width: 281mm; height: 194mm;
      padding: 3mm 5mm 2.5mm;
      display: flex; flex-direction: column; gap: 2.5mm;
      overflow: hidden; page-break-inside: avoid; break-inside: avoid;
      background:
        radial-gradient(ellipse 55% 40% at 78% 0%, rgba(46, 255, 184, 0.12), transparent 70%),
        ${P.bg};
      color: ${P.text};
    }
    .sheet--break { page-break-after: always; break-after: page; }
    .cap {
      display: grid; grid-template-columns: 1.1fr 1.2fr; gap: 4mm;
      align-items: end; border-bottom: 0.45mm solid ${P.accent};
      padding-bottom: 2.8mm; flex-shrink: 0;
    }
    .cap-club { font-size: 9pt; line-height: 1.4; color: ${P.muted}; }
    .cap-line { display: block; }
    .cap-phone {
      display: block; margin-top: 1mm; font-weight: 700;
      color: ${P.accentBright}; text-decoration: underline; text-underline-offset: 1.2mm;
    }
    .cap-title { text-align: center; }
    .cap-title h1 {
      margin: 0; font-size: 18pt; font-weight: 800;
      letter-spacing: -0.02em; line-height: 1.08; color: ${P.accentBright};
    }
    .cap-title .group {
      margin: 1.4mm 0 0;
      font-size: 11pt; font-weight: 800; letter-spacing: 0.06em;
      text-transform: uppercase; color: ${P.accent};
    }
    .table-wrap {
      flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
      border-radius: 3mm; border: 0.5mm solid ${P.accent};
      background: ${P.card}; overflow: hidden;
    }
    table {
      width: 100%; height: 100%; border-collapse: collapse;
      table-layout: fixed; line-height: 1.15;
    }
    tbody tr { height: var(--row-h, auto); }
    th, td {
      border: 0.35mm solid rgba(46, 255, 184, 0.5);
      padding: 1.6mm 1mm; text-align: center; vertical-align: middle;
      word-break: break-word; color: ${P.text};
    }
    thead th { background: ${P.headBg}; font-weight: 700; color: ${P.muted}; }
    th.sub-off, .sub-off { color: ${P.off}; font-weight: 700; }
    th.tariff {
      border: 0.45mm solid rgba(46, 255, 184, 0.78);
      background: rgba(46, 255, 184, 0.1);
    }
    .tariff .code { font-size: 1.05em; color: ${P.accentBright}; }
    .sub { font-size: 0.88em; font-weight: 600; color: ${P.dim}; }
    th.axis, td.axis {
      font-weight: 800; background: rgba(6, 18, 16, 0.65);
      font-size: 1.05em; color: ${P.text};
    }
    td.axis.left, th.axis.left { text-align: left; padding-left: 3mm; }
    td.num { font-variant-numeric: tabular-nums; color: ${P.full}; }
    td.off { font-weight: 800; color: ${P.off}; background: ${P.offBg}; }
    tr.alt td, tr.alt th.axis { background: ${P.rowAlt}; }
    tr.alt td.off { background: rgba(46, 255, 184, 0.12); }
    .basement {
      flex-shrink: 0; border-top: 0.35mm solid ${P.border};
      padding-top: 2mm; display: flex; flex-direction: column; gap: 1.2mm;
    }
    .basement-row {
      display: flex; flex-wrap: wrap; justify-content: space-between;
      gap: 2mm 8mm; font-size: 10pt; font-weight: 700; color: ${P.text};
    }
    .basement-valid {
      margin: 0; text-align: center; font-size: 9pt;
      font-weight: 600; color: ${P.accentBright};
    }
    .empty { margin: auto; text-align: center; color: ${P.muted}; font-size: 12pt; }
    .foot { flex-shrink: 0; font-size: 7.5pt; color: ${P.dim}; text-align: right; }
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
