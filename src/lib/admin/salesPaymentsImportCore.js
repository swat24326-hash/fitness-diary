/**
 * Импорт «Отчёт по оплатам» (1С) → строки продаж + черновик дневного отчёта.
 * Чистая логика без React / IDB / xlsx.
 */

import {
  classifySaleClientSegment,
  saleSegmentToProfitBucket,
} from './salesClientSegmentCore.js'
import {
  emptyDailyForm,
  salesMatrixSumKey,
  SALES_DOP_FORM_SUM_KEY,
} from './salesReportCore.js'
import {
  looksLikeSalesCardNumber,
  matchClientsByCardNumber,
  normalizeSalesCardNumber,
} from './salesClientMatchCore.js'

/** @typedef {'pz'|'tz'|'az'|'dop'|null} SalesHallKey */
/** @typedef {'nk'|'dk'|'uk'|null} ProfitBucket */

/**
 * @param {unknown} cell
 * @returns {string}
 */
export function cellText(cell) {
  if (cell == null) return ''
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    if (Number.isInteger(cell)) return String(cell)
    return String(cell)
  }
  return String(cell).replace(/\s+/g, ' ').trim()
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function parseImportMoney(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100) / 100
  let s = cellText(raw)
  if (!s) return NaN
  s = s.replace(/\s/g, '').replace(/₽/g, '').replace(/руб\.?/gi, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

/**
 * @param {string} text
 * @returns {SalesHallKey}
 */
export function detectSalesHallFromLabel(text) {
  const t = cellText(text).toLowerCase()
  if (!t) return null
  if (t.includes('клубн') && t.includes('карт')) return 'dop'
  if (t.includes('персональн') || (t.includes('персон') && t.includes('зал')) || t === 'пз' || t.startsWith('пз ')) {
    return 'pz'
  }
  // «ТЗ», «ТЗ Утро» — \b плохо работает с кириллицей
  if ((t.includes('тренаж') && t.includes('зал')) || t === 'тз' || t.startsWith('тз ')) return 'tz'
  if ((t.includes('аэроб') && t.includes('зал')) || t === 'аз' || t.startsWith('аз ')) return 'az'
  return null
}

/**
 * @param {unknown[][]} rows
 * @returns {string|null} YYYY-MM-DD
 */
export function parsePaymentsReportDate(rows) {
  for (const row of rows ?? []) {
    for (const cell of row ?? []) {
      const t = cellText(cell)
      const m = t.match(/Период:\s*(\d{2})\.(\d{2})\.(\d{4})/i)
      if (m) return `${m[3]}-${m[2]}-${m[1]}`
      const m2 = t.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*\1\.\2\.\3/)
      if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`
    }
  }
  return null
}

/**
 * @param {unknown[]} row
 * @returns {{ cardNumber: string, name: string, amount: number } | null}
 */
export function tryParseClientSaleRow(row) {
  const cells = (row ?? []).map(cellText)
  if (!cells.length) return null
  const first = cells[0]
  if (!looksLikeSalesCardNumber(first)) return null
  const name = cells[1] || ''
  if (!name || detectSalesHallFromLabel(name)) return null
  // менеджер без карты — отсев: имя из двух+ слов или одно, но не «Итого»
  if (/^итого$/i.test(name)) return null
  let amount = NaN
  for (let i = cells.length - 1; i >= 2; i--) {
    const n = parseImportMoney(cells[i])
    if (!Number.isNaN(n) && n > 0) {
      amount = n
      break
    }
  }
  if (Number.isNaN(amount) || amount <= 0) {
    // иногда сумма во 2-й колонке при короткой строке
    for (let i = 2; i < cells.length; i++) {
      const n = parseImportMoney(cells[i])
      if (!Number.isNaN(n) && n > 0) {
        amount = n
        break
      }
    }
  }
  if (Number.isNaN(amount) || amount <= 0) return null
  return {
    cardNumber: normalizeSalesCardNumber(first),
    name,
    amount,
  }
}

/**
 * Разбор AOA листа «Отчёт по оплатам».
 * @param {unknown[][]} rows
 * @returns {{
 *   reportDate: string|null,
 *   lines: Array<{
 *     id: string,
 *     cardNumber: string,
 *     name: string,
 *     tariffName: string,
 *     hall: SalesHallKey,
 *     amount: number,
 *   }>,
 *   fileTotal: number|null,
 *   reasons: string[],
 * }}
 */
export function parseSalesPaymentsAoA(rows) {
  const reasons = []
  const reportDate = parsePaymentsReportDate(rows)
  /** @type {SalesHallKey} */
  let hall = null
  let tariffName = ''
  /** @type {Array<{ id: string, cardNumber: string, name: string, tariffName: string, hall: SalesHallKey, amount: number }>} */
  const lines = []
  let fileTotal = null
  let lineSeq = 0

  for (const row of rows ?? []) {
    const cells = (row ?? []).map(cellText).filter((c) => c !== '')
    if (!cells.length) continue
    const joined = cells.join(' ')

    if (/^итого$/i.test(cells[0])) {
      for (let i = cells.length - 1; i >= 1; i--) {
        const n = parseImportMoney(cells[i])
        if (!Number.isNaN(n) && n > 0) {
          fileTotal = n
          break
        }
      }
      continue
    }

    if (/^продажа$/i.test(cells[0]) && cells.length <= 5) continue
    if (/^составила/i.test(joined)) continue
    if (/параметры|отбор|объект оплаты|регистратор|вид абонемента/i.test(joined) && !looksLikeSalesCardNumber(cells[0])) {
      continue
    }

    const hallHit = detectSalesHallFromLabel(cells[0])
    if (hallHit && !looksLikeSalesCardNumber(cells[0])) {
      hall = hallHit
      tariffName = ''
      continue
    }

    const client = tryParseClientSaleRow(row)
    if (client) {
      if (!hall) {
        reasons.push(`Строка ${client.cardNumber}: зал не определён — пропуск`)
        continue
      }
      lineSeq += 1
      lines.push({
        id: `L${lineSeq}`,
        cardNumber: client.cardNumber,
        name: client.name,
        tariffName: tariffName || '—',
        hall,
        amount: client.amount,
      })
      continue
    }

    // строка менеджера с названием зала во 2-й колонке
    if (cells.length >= 2 && detectSalesHallFromLabel(cells[1])) continue

    // тариф под текущим залом
    if (hall && cells[0] && !looksLikeSalesCardNumber(cells[0]) && !detectSalesHallFromLabel(cells[0])) {
      if (!/^продажа$/i.test(cells[0]) && !/^итого$/i.test(cells[0])) {
        tariffName = cells[0]
      }
    }
  }

  return { reportDate, lines, fileTotal, reasons }
}

/**
 * Подсказка НК/ДК/УК для строки импорта (без отдельного УК1 в UI).
 * @param {{
 *   hall: SalesHallKey,
 *   saleDate: string,
 *   clientId?: string|null,
 *   memList?: object[],
 *   trainings?: object[],
 *   matchStatus: string,
 * }} input
 */
export function suggestImportProfitBucket(input) {
  const hall = input.hall
  const matchStatus = input.matchStatus

  if (matchStatus === 'conflict') {
    return {
      bucket: /** @type {ProfitBucket} */ (null),
      confident: false,
      reason: 'Конфликт карты — укажите НК/ДК/УК вручную',
      segment: null,
    }
  }

  if (hall === 'dop') {
    return {
      bucket: /** @type {ProfitBucket} */ (null),
      confident: true,
      reason: 'Доп. / клубная карта — только в «Доп. продажи», без НК/ДК/УК',
      segment: null,
    }
  }

  if (matchStatus === 'none' || matchStatus === 'empty') {
    return {
      bucket: /** @type {ProfitBucket} */ (null),
      confident: false,
      reason:
        hall === 'tz' || hall === 'az'
          ? 'Нет клиента/абона в базе данных (ТЗ/АЗ) — укажите сегмент вручную'
          : 'Клиент не найден — укажите НК/ДК/УК вручную',
      segment: null,
    }
  }

  const classified = classifySaleClientSegment({
    saleDate: input.saleDate,
    clientId: input.clientId ?? undefined,
    memList: input.memList ?? [],
    trainings: input.trainings ?? [],
  })
  const bucket = saleSegmentToProfitBucket(classified.segment)

  if (classified.hasUsableMembership) {
    return {
      bucket: /** @type {ProfitBucket} */ ('dk'),
      confident: true,
      reason: 'ДК — абонемент действует на дату продажи',
      segment: classified.segment,
    }
  }

  if (classified.daysSinceEnd != null && classified.daysSinceEnd >= 0) {
    return {
      bucket: /** @type {ProfitBucket} */ ('uk'),
      confident: true,
      reason: 'УК — абонемент уже закончился к дате продажи',
      segment: classified.segment,
    }
  }

  if (hall === 'tz' || hall === 'az') {
    return {
      bucket: /** @type {ProfitBucket} */ (null),
      confident: false,
      reason: 'ТЗ/АЗ без истории абона — укажите НК/ДК/УК вручную',
      segment: classified.segment,
    }
  }

  // ПЗ: мягкая подсказка классификатора
  return {
    bucket: /** @type {ProfitBucket} */ (bucket),
    confident: Boolean(bucket),
    reason:
      bucket === 'nk'
        ? 'НК — нет тренировок до продажи (подсказка, можно изменить)'
        : bucket === 'dk'
          ? 'ДК — есть история в зале'
          : 'Укажите сегмент вручную',
    segment: classified.segment,
  }
}

/**
 * @param {{
 *   lines: ReturnType<typeof parseSalesPaymentsAoA>['lines'],
 *   reportDate: string,
 *   clients: object[],
 *   membershipsByClientId?: Record<string, object[]>,
 *   trainingsByClientId?: Record<string, object[]>,
 * }} input
 */
export function enrichSalesPaymentLines(input) {
  const saleDate = String(input.reportDate ?? '').slice(0, 10)
  return (input.lines ?? []).map((line) => {
    const match = matchClientsByCardNumber(input.clients, line.cardNumber)
    const clientId = match.client?.id != null ? String(match.client.id) : null
    const memList = clientId ? input.membershipsByClientId?.[clientId] ?? [] : []
    const trainings = clientId ? input.trainingsByClientId?.[clientId] ?? [] : []
    const suggest = suggestImportProfitBucket({
      hall: line.hall,
      saleDate,
      clientId,
      memList,
      trainings,
      matchStatus: match.status,
    })
    return {
      ...line,
      clientId,
      clientName: match.client?.name ? String(match.client.name) : line.name,
      matchStatus: match.status,
      matchReason: match.reason,
      profitBucket: suggest.bucket,
      bucketConfident: suggest.confident,
      bucketReason: suggest.reason,
      include: true,
    }
  })
}

/**
 * Собрать черновик dailyForm из размеченных строк.
 * @param {Array<{ hall: SalesHallKey, amount: number, profitBucket: ProfitBucket, include?: boolean }>} lines
 */
export function buildDailyFormFromPaymentLines(lines) {
  const form = emptyDailyForm()
  /** @type {Record<string, number>} */
  const counts = {}
  /** @type {Record<string, number>} */
  const sums = {}
  let dopSum = 0
  let included = 0
  let skipped = 0
  let needBucket = 0

  for (const line of lines ?? []) {
    if (line.include === false) {
      skipped += 1
      continue
    }
    if (line.hall === 'dop') {
      dopSum += Number(line.amount) || 0
      included += 1
      continue
    }
    if (!line.hall || !line.profitBucket) {
      needBucket += 1
      continue
    }
    const countKey = `${line.hall}_${line.profitBucket}`
    counts[countKey] = (counts[countKey] || 0) + 1
    sums[countKey] = Math.round(((sums[countKey] || 0) + Number(line.amount)) * 100) / 100
    included += 1
  }

  for (const [key, n] of Object.entries(counts)) {
    form[key] = String(n)
    form[salesMatrixSumKey(key)] = String(sums[key] ?? 0)
  }
  if (dopSum > 0) form[SALES_DOP_FORM_SUM_KEY] = String(Math.round(dopSum * 100) / 100)

  return {
    form,
    included,
    skipped,
    needBucket,
    matrixSum: Object.values(sums).reduce((a, b) => a + b, 0) + dopSum,
  }
}
