/**
 * Импорт «Отчёт по оплатам» (1С) → строки продаж + черновик дневного отчёта.
 * Чистая логика без React / IDB / xlsx.
 */

import { classifySaleClientSegment, saleSegmentToProfitBucket } from './salesClientSegmentCore.js'
import {
  emptyDailyForm,
  salesMatrixSumKey,
  SALES_DOP_FORM_SUM_KEY,
  SALES_MATRIX_HALL_KEYS,
  SALES_REFUNDS_FORM_KEY,
} from './salesReportCore.js'
import {
  looksLikeSalesCardNumber,
  matchClientsByCardNumber,
  normalizeSalesCardNumber,
} from './salesClientMatchCore.js'
import { clientCrmHallKind } from './deskHallClientsCore.js'
import { clientMembershipHallSet } from '../membershipHallCore.js'
import { isOneTimeTariffName } from './deskPackageDurationCore.js'
import { parsePaymentsReportPeriod } from './salesImportDateCore.js'

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
  const t = cellText(text).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
  if (!t) return null
  // «ТЗ разовое» / длинное имя тарифа — не смена зала
  if (isOneTimeTariffName(t)) return null
  if (t === 'клубная карта' || t === 'клубные карты') return 'dop'
  if (t === 'пз' || t === 'персональный зал') return 'pz'
  if (t === 'тз' || t === 'тренажерный зал' || t === 'тз утро') return 'tz'
  if (t === 'аз' || t === 'аэробный зал' || t === 'аз утро') return 'az'
  return null
}

/**
 * Дата одного дня из шапки файла. Период разных дат → null (не класть месяц на 1-е).
 * @param {unknown[][]} rows
 * @returns {string|null} YYYY-MM-DD
 */
export function parsePaymentsReportDate(rows) {
  const period = parsePaymentsReportPeriod(rows)
  if (!period || !period.sameDay) return null
  return period.start
}

/**
 * Сумма строки: итог (нал+безнал), а не последнее число.
 * @param {number[]} nums
 * @returns {number}
 */
export function pickSaleRowAmount(nums) {
  const values = (nums ?? []).filter((n) => Number.isFinite(n) && n !== 0)
  if (!values.length) return NaN
  const pos = values.filter((n) => n > 0)
  const neg = values.filter((n) => n < 0)
  if (neg.length && !pos.length) {
    if (neg.length === 1) return neg[0]
    const last = neg[neg.length - 1]
    const restSum = neg.slice(0, -1).reduce((a, b) => a + b, 0)
    if (Math.abs(last - restSum) < 0.05) return last
    return last
  }
  if (pos.length === 1) return pos[0]
  if (pos.length === 2) {
    if (Math.abs(pos[0] - pos[1]) < 0.02) return pos[0]
    return Math.round((pos[0] + pos[1]) * 100) / 100
  }
  const last = pos[pos.length - 1]
  const restSum = pos.slice(0, -1).reduce((a, b) => a + b, 0)
  if (Math.abs(last - restSum) < 0.05) return last
  return last
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
  if (/^итого$/i.test(name)) return null
  /** @type {number[]} */
  const money = []
  for (let i = 2; i < cells.length; i++) {
    const n = parseImportMoney(cells[i])
    if (!Number.isNaN(n) && n !== 0) money.push(n)
  }
  const amount = pickSaleRowAmount(money)
  if (Number.isNaN(amount) || amount === 0) return null
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
 *   linesSum: number,
 *   refundsAmount: number,
 *   periodStart: string|null,
 *   periodEnd: string|null,
 *   periodRange: boolean,
 *   reasons: string[],
 * }}
 */
export function parseSalesPaymentsAoA(rows) {
  const reasons = []
  const period = parsePaymentsReportPeriod(rows)
  const periodStart = period?.start ?? null
  const periodEnd = period?.end ?? null
  const periodRange = Boolean(period && !period.sameDay)
  const reportDate = period && period.sameDay ? period.start : null
  if (periodRange) {
    reasons.push(
      `Файл за период ${periodStart} — ${periodEnd}, не за один день. В дневной отчёт такой файл не подставляем.`,
    )
  }
  if (!period) {
    reasons.push('В файле нет даты периода — не подставляем в «сегодня» наугад.')
  }
  /** @type {SalesHallKey} */
  let hall = null
  let tariffName = ''
  /** @type {Array<{ id: string, cardNumber: string, name: string, tariffName: string, hall: SalesHallKey, amount: number }>} */
  const lines = []
  let fileTotal = null
  let refundsAmount = 0
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
      if (client.amount < 0) {
        refundsAmount = Math.round((refundsAmount + Math.abs(client.amount)) * 100) / 100
        reasons.push(`Возврат ${client.cardNumber}: ${Math.abs(client.amount)} ₽`)
        continue
      }
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

  const linesSum = Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100
  if (fileTotal != null && Math.abs(fileTotal - linesSum) > 1) {
    reasons.push(
      `Итог файла ${fileTotal} ₽, сумма разобранных строк ${linesSum} ₽ — проверьте пропуски и возвраты.`,
    )
  }

  return {
    reportDate,
    periodStart,
    periodEnd,
    periodRange,
    lines,
    fileTotal,
    linesSum,
    refundsAmount,
    reasons,
  }
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
    ignoreMembershipsStartingOnSaleDate: true,
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

  if (classified.reason === 'depleted_in_period' || classified.profitBucket === 'uk') {
    return {
      bucket: /** @type {ProfitBucket} */ ('uk'),
      confident: true,
      reason: 'УК — занятия закончились, срок абонемента ещё идёт',
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
    const match = matchClientsByCardNumber(input.clients, line.cardNumber, {
      preferOperational: true,
      paymentName: line.name,
    })
    const clientId = match.client?.id != null ? String(match.client.id) : null
    const memList = clientId ? input.membershipsByClientId?.[clientId] ?? [] : []
    const trainings = clientId ? input.trainingsByClientId?.[clientId] ?? [] : []
    const matchedHalls = match.client
      ? [...clientMembershipHallSet(match.client, memList)]
      : []
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
      matchedHallKind: clientCrmHallKind(match.client),
      matchedHalls,
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

/**
 * Можно ли подставить разбор в открытый день отчёта.
 * @param {{ reportDate?: string|null, periodRange?: boolean }} parsed
 * @param {string} reportDate
 */
export function canApplyPaymentsImportToReportDate(parsed, reportDate) {
  if (parsed?.periodRange) {
    return {
      ok: false,
      error: 'Файл за период, не за один день. Выгрузите оплаты за нужную дату.',
    }
  }
  const fileDate = String(parsed?.reportDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fileDate)) {
    return {
      ok: false,
      error: 'В файле нет даты одного дня. Не подставляем в открытый день наугад.',
    }
  }
  const open = String(reportDate ?? '').slice(0, 10)
  if (fileDate !== open) {
    return {
      ok: false,
      error: `Файл за ${fileDate}, открыт день ${open || '—'}. Сначала откройте день файла.`,
      fileDate,
    }
  }
  return { ok: true, fileDate }
}

/**
 * В форме уже есть суммы продаж (подстановка затрёт матрицу).
 * @param {Record<string, string>|null|undefined} form
 */
export function dailyFormHasFilledSalesMatrix(form) {
  if (!form) return false
  for (const key of SALES_MATRIX_HALL_KEYS) {
    if (Number(form[key]) > 0) return true
    if (Number(form[salesMatrixSumKey(key)]) > 0) return true
  }
  if (Number(form[SALES_DOP_FORM_SUM_KEY]) > 0) return true
  return false
}

/**
 * Матрица НК/ДК/УК и доп. из Excel; ПНК, тренировки и возвраты (если файл без возвратов) не трогаем.
 * @param {Record<string, string>|null|undefined} prev
 * @param {Record<string, string>} builtForm
 * @param {{ refundsAmount?: number }} [opts]
 */
export function mergePaymentImportIntoDailyForm(prev, builtForm, opts = {}) {
  const base = prev && typeof prev === 'object' ? prev : emptyDailyForm()
  const next = { ...base }
  for (const key of SALES_MATRIX_HALL_KEYS) {
    next[key] = builtForm?.[key] ?? ''
    const sumKey = salesMatrixSumKey(key)
    next[sumKey] = builtForm?.[sumKey] ?? ''
  }
  next[SALES_DOP_FORM_SUM_KEY] = builtForm?.[SALES_DOP_FORM_SUM_KEY] ?? ''
  const refunds = Number(opts.refundsAmount)
  if (Number.isFinite(refunds) && refunds > 0) {
    next[SALES_REFUNDS_FORM_KEY] = String(Math.round(refunds * 100) / 100)
  }
  return next
}
