/**
 * Связка строк оплат (31.xlsx) с карточками: match по карте → lite / клип / desk.
 * Чистая логика без React / IDB.
 */

import { normalizeSalesCardNumber } from './salesClientMatchCore.js'
import { isTrainerWithoutTablet } from './trainerTabletModeCore.js'
import { DESK_PACKAGE_MONTH_OPTIONS } from './deskMembershipLedgerCore.js'

function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

/**
 * Срок пакета из названия тарифа (1 / 1.5 / 2 мес). По умолчанию 1.
 * @param {string} tariffName
 * @returns {number}
 */
export function inferPackageMonthsFromTariff(tariffName) {
  const t = String(tariffName ?? '')
  const mes = t.match(/(\d+(?:[.,]\d+)?)\s*мес/i)
  if (mes) {
    const n = Number(String(mes[1]).replace(',', '.'))
    if (Number.isFinite(n) && n > 0) return pickNearestPackageMonths(n)
  }
  // «12/1 Elite», «8/1 Diamond» — второе число = месяцы
  const slash = t.match(/^\s*\d+\s*\/\s*(\d+(?:[.,]\d+)?)/)
  if (slash) {
    const n = Number(String(slash[1]).replace(',', '.'))
    if (Number.isFinite(n) && n > 0 && n <= 24) return pickNearestPackageMonths(n)
  }
  return 1
}

function pickNearestPackageMonths(n) {
  const opts = DESK_PACKAGE_MONTH_OPTIONS.length ? DESK_PACKAGE_MONTH_OPTIONS : [1, 3, 6, 12]
  if (opts.includes(n)) return n
  // 1.5 → ближайшее из опций или оставить как есть если 1.5 в опциях нет
  let best = opts[0]
  let dist = Math.abs(best - n)
  for (const o of opts) {
    const d = Math.abs(o - n)
    if (d < dist) {
      best = o
      dist = d
    }
  }
  // если близко к 1.5 и есть 1 — всё же 1; пользователь поправит
  if (Math.abs(n - 1.5) < 0.01) return opts.includes(1.5) ? 1.5 : 1
  return best
}

/**
 * Направление АЗ из названия тарифа («10 занятий Бокс» → тип Бокс).
 * @param {string} tariffName
 * @param {object[]} azTypes — { id, code, name }
 * @returns {object|null}
 */
export function matchAzDirectionFromTariff(tariffName, azTypes) {
  const key = normKey(tariffName)
  if (!key || !Array.isArray(azTypes) || !azTypes.length) return null

  let best = null
  let bestLen = 0
  for (const t of azTypes) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const candidates = [t.name, t.code].map(normKey).filter(Boolean)
    for (const c of candidates) {
      if (c.length < 2) continue
      if (key.includes(c) || c.includes(key)) {
        if (c.length > bestLen) {
          best = t
          bestLen = c.length
        }
      }
    }
  }
  return best
}

/**
 * Последняя строка по карте (для АЗ — последнее направление).
 * @param {object[]} lines — enriched payment lines
 * @returns {object[]}
 */
export function collapsePaymentLinesByCardLastWins(lines) {
  /** @type {Map<string, object>} */
  const byCard = new Map()
  for (const l of lines ?? []) {
    if (l?.include === false) continue
    const hall = l?.hall
    if (hall === 'dop' || !hall) continue
    const card = normalizeSalesCardNumber(l.cardNumber ?? l.card_number)
    if (!card) continue
    byCard.set(card, l)
  }
  return [...byCard.values()]
}

/**
 * Черновики действий после импорта оплат.
 * @param {{
 *   lines: object[],
 *   azTypes?: object[],
 * }} input
 */
export function buildPaymentClientLinkActions(input) {
  const collapsed = collapsePaymentLinesByCardLastWins(input.lines ?? [])
  const azTypes = input.azTypes ?? []
  /** @type {object[]} */
  const actions = []

  for (const l of collapsed) {
    const card = normalizeSalesCardNumber(l.cardNumber)
    const name = String(l.clientName || l.name || '').trim()
    const hall = l.hall
    const matchStatus = String(l.matchStatus ?? '')
    const clientId = l.clientId ? String(l.clientId) : null
    const packageMonths = inferPackageMonthsFromTariff(l.tariffName)
    const base = {
      id: String(l.id ?? card),
      lineId: l.id,
      cardNumber: card,
      clientName: name,
      amount: Number(l.amount) || 0,
      hall,
      tariffName: String(l.tariffName ?? ''),
      matchStatus,
      clientId,
      packageMonths,
      trainerId: '',
      membershipTypeId: '',
      status: 'pending',
      error: '',
    }

    if (matchStatus === 'one' && clientId) {
      actions.push({
        ...base,
        kind: 'skip_matched',
        label: 'Уже в Оси',
      })
      continue
    }

    if (hall === 'pz') {
      actions.push({
        ...base,
        kind: 'pz_need_trainer',
        label: 'ПЗ: выбрать тренера',
      })
      continue
    }

    if (hall === 'az') {
      const dir = matchAzDirectionFromTariff(l.tariffName, azTypes)
      actions.push({
        ...base,
        kind: 'az_desk',
        label: 'АЗ: desk-карточка',
        membershipTypeId: dir?.id ? String(dir.id) : '',
        membershipTypeLabel: dir ? String(dir.name || dir.code || '') : '',
      })
      continue
    }

    if (hall === 'tz') {
      actions.push({
        ...base,
        kind: 'tz_desk',
        label: 'ТЗ: desk-карточка',
      })
      continue
    }
  }

  return actions
}

/**
 * Режим ПЗ по выбранному тренеру.
 * @param {object|null|undefined} trainer
 * @returns {'lite'|'clip'|null}
 */
export function resolvePzLinkMode(trainer) {
  if (!trainer?.id) return null
  return isTrainerWithoutTablet(trainer) ? 'lite' : 'clip'
}

/**
 * @param {object} action
 * @param {object|null|undefined} trainer
 */
export function validatePaymentLinkAction(action, trainer) {
  const kind = action?.kind
  if (kind === 'skip_matched') return { ok: true }
  if (kind === 'pz_need_trainer') {
    if (!String(action?.trainerId ?? '').trim()) {
      return { ok: false, error: 'Выберите тренера' }
    }
    if (!trainer) return { ok: false, error: 'Тренер не найден' }
    const mode = resolvePzLinkMode(trainer)
    if (!mode) return { ok: false, error: 'Не удалось определить режим тренера' }
    return { ok: true, mode }
  }
  if (kind === 'az_desk' || kind === 'tz_desk') {
    if (!action?.cardNumber || !action?.clientName) {
      return { ok: false, error: 'Нет карты или ФИО' }
    }
    return { ok: true }
  }
  return { ok: false, error: 'Неизвестное действие' }
}

/**
 * Сводка блока «Карточки из оплат» (без React).
 * @param {object[]} actions
 */
export function summarizePaymentClientLinkActions(actions) {
  let matched = 0
  let done = 0
  let pzPending = 0
  let deskPending = 0
  let pzAmount = 0
  let pzReady = 0
  for (const a of actions ?? []) {
    if (a?.status === 'done') {
      done += 1
      continue
    }
    if (a?.kind === 'skip_matched') {
      matched += 1
      continue
    }
    if (a?.kind === 'pz_need_trainer') {
      pzPending += 1
      pzAmount += Number(a?.amount) || 0
      if (String(a?.trainerId ?? '').trim()) pzReady += 1
      continue
    }
    if (a?.kind === 'az_desk' || a?.kind === 'tz_desk') {
      deskPending += 1
    }
  }
  return {
    matched,
    done,
    pzPending,
    deskPending,
    pzReady,
    pzAmount: Math.round(pzAmount),
    needWork: pzPending + deskPending,
  }
}

/**
 * Шапка приоритетного списка: «3 ПЗ без карточки на сумму 28 360 ₽».
 * @param {{ count?: number, amount?: number }} opts
 */
export function describePzMissingFromPaymentsMetaRu(opts) {
  const count = Math.max(0, Math.trunc(Number(opts?.count) || 0))
  const amount = Math.round(Number(opts?.amount) || 0)
  const countLabel = new Intl.NumberFormat('ru-RU').format(count)
  if (count === 0) return 'Нет ПЗ без карточки в файле'
  const people =
    count === 1 ? '1 ПЗ без карточки' : `${countLabel} ПЗ без карточки`
  if (!(amount > 0)) return people
  const sumLabel = new Intl.NumberFormat('ru-RU').format(amount)
  return `${people} на сумму ${sumLabel} ₽`
}

/**
 * Строки, которые ещё нужно создать: ПЗ отдельно от desk.
 * @param {object[]} actions
 */
export function partitionPaymentClientLinkNeedWork(actions) {
  /** @type {object[]} */
  const pz = []
  /** @type {object[]} */
  const desk = []
  for (const a of actions ?? []) {
    if (!a || a.status === 'done' || a.kind === 'skip_matched') continue
    if (a.kind === 'pz_need_trainer') pz.push(a)
    else if (a.kind === 'az_desk' || a.kind === 'tz_desk') desk.push(a)
  }
  return { pz, desk }
}

/**
 * Тренеры без планшета выше — менеджер быстрее закрывает lite.
 * @param {object[]} trainers
 */
export function sortTrainersForPzPaymentLink(trainers) {
  return [...(trainers ?? [])].sort((a, b) => {
    const aNo = isTrainerWithoutTablet(a) ? 0 : 1
    const bNo = isTrainerWithoutTablet(b) ? 0 : 1
    if (aNo !== bNo) return aNo - bNo
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru')
  })
}

/**
 * Можно ли жать «Создать» (для UI disable).
 * @param {object} action
 * @param {object|null|undefined} trainer
 */
export function isPaymentLinkActionReady(action, trainer) {
  return validatePaymentLinkAction(action, trainer).ok === true
}
