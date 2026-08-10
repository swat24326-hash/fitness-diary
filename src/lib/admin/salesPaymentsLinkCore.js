/**
 * Связка строк оплат (31.xlsx) с карточками: match по карте → lite / клип / desk.
 * Чистая логика без React / IDB.
 */

import { normalizeSalesCardNumber } from './salesClientMatchCore.js'
import { isTrainerWithoutTablet } from './trainerTabletModeCore.js'
import { DESK_PACKAGE_MONTH_OPTIONS } from './deskMembershipLedgerCore.js'

/** Sentinel UI: пункт «Другое…» в select срока. */
export const PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM = '__custom__'

/** Верхняя граница произвольного срока (месяцы) — как в validate. */
export const PAYMENT_LINK_PACKAGE_MONTHS_MAX = 36

function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

/**
 * Срок пакета из названия тарифа (1 / 1.5 / 2 мес). По умолчанию 1.
 * Угадывание — только старт черновика; менеджер может сменить срок в UI.
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
 * Пресет прайса (1 / 2 / 3 / 6 / 12), не «Другое».
 * @param {unknown} months
 */
export function isPaymentLinkPackageMonthsPreset(months) {
  const n = Number(months)
  return Number.isFinite(n) && DESK_PACKAGE_MONTH_OPTIONS.includes(n)
}

/**
 * Разбор поля «Другое» / произвольного срока.
 * Пусто или мусор → null (кнопка «Создать» не готова).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parsePaymentLinkCustomPackageMonths(raw) {
  if (raw === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM) return null
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM) return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const t = Math.trunc(n)
  if (t < 1 || t > PAYMENT_LINK_PACKAGE_MONTHS_MAX) return null
  return t
}

/**
 * Нормализация срока для черновика из тарифа / apply (никогда null).
 * Пустое → 1. Произвольное целое 1…36 сохраняется.
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizePaymentLinkPackageMonths(raw) {
  const parsed = parsePaymentLinkCustomPackageMonths(raw)
  if (parsed != null) return parsed
  return 1
}

/**
 * Значение `<select>`: пресет или sentinel «Другое».
 * @param {unknown} months
 * @param {boolean} [forceCustom]
 */
export function paymentLinkPackageMonthsSelectValue(months, forceCustom = false) {
  if (forceCustom) return PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM
  if (months == null || months === '') return PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM
  if (isPaymentLinkPackageMonthsPreset(months)) return String(Number(months))
  return PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM
}

/**
 * Срок готов к созданию карточки.
 * @param {unknown} months
 */
export function isPaymentLinkPackageMonthsReady(months) {
  const n = parsePaymentLinkCustomPackageMonths(months)
  return n != null
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
 * Схлопывание строк оплат для связки карточек.
 * Ключ = карта + зал: ПЗ и ТЗ на одном номере — две строки (не затирают друг друга).
 * Несколько строк одного зала (АЗ: смена направления) — last wins.
 * @param {object[]} lines — enriched payment lines
 * @returns {object[]}
 */
export function collapsePaymentLinesByCardHallLastWins(lines) {
  /** @type {Map<string, object>} */
  const byKey = new Map()
  for (const l of lines ?? []) {
    if (l?.include === false) continue
    const hall = l?.hall
    if (hall === 'dop' || !hall) continue
    const card = normalizeSalesCardNumber(l.cardNumber ?? l.card_number)
    if (!card) continue
    byKey.set(`${card}::${hall}`, l)
  }
  return [...byKey.values()]
}

/**
 * @deprecated имя; то же, что collapsePaymentLinesByCardHallLastWins
 * @param {object[]} lines
 */
export function collapsePaymentLinesByCardLastWins(lines) {
  return collapsePaymentLinesByCardHallLastWins(lines)
}

/**
 * Другие незакрытые действия с той же картой (другой зал) — для подсказки в UI.
 * @param {object[]} actions
 * @param {object} action
 * @returns {object[]}
 */
export function siblingPaymentLinkActionsSameCard(actions, action) {
  const card = normalizeSalesCardNumber(action?.cardNumber)
  const hall = String(action?.hall ?? '')
  if (!card || !hall) return []
  return (actions ?? []).filter((a) => {
    if (!a || a === action) return false
    if (a.status === 'done' || a.kind === 'skip_matched' || a.kind === 'skip_cross_hall') return false
    if (normalizeSalesCardNumber(a.cardNumber) !== card) return false
    return String(a.hall ?? '') !== hall
  })
}

/**
 * После успешного создания: siblings с той же картой остаются (допишут membership).
 * Раньше блокировали — это противоречило модели «один client, много залов».
 * @param {object[]} actions
 * @param {object} _createdAction
 * @returns {object[]}
 */
export function markPaymentLinkSameCardSiblingsBlocked(actions, _createdAction) {
  return actions ?? []
}

/**
 * Подпись зала для UI.
 * @param {unknown} hall
 */
export function paymentLinkHallLabelRu(hall) {
  const h = String(hall ?? '').toLowerCase()
  if (h === 'pz') return 'ПЗ'
  if (h === 'tz') return 'ТЗ'
  if (h === 'az') return 'АЗ'
  return String(hall ?? '').toUpperCase() || '—'
}

/**
 * Черновики действий после импорта оплат.
 * @param {{
 *   lines: object[],
 *   azTypes?: object[],
 * }} input
 */
export function buildPaymentClientLinkActions(input) {
  const collapsed = collapsePaymentLinesByCardHallLastWins(input.lines ?? [])
  const azTypes = input.azTypes ?? []
  /** @type {object[]} */
  const actions = []

  for (const l of collapsed) {
    const card = normalizeSalesCardNumber(l.cardNumber)
    const name = String(l.clientName || l.name || '').trim()
    const hall = l.hall
    const matchStatus = String(l.matchStatus ?? '')
    const clientId = l.clientId ? String(l.clientId) : null
    const matchedHallKind = l.matchedHallKind ? String(l.matchedHallKind) : null
    const matchedHalls = new Set(
      Array.isArray(l.matchedHalls) ? l.matchedHalls.map((h) => String(h)) : [],
    )
    const packageMonths = normalizePaymentLinkPackageMonths(inferPackageMonthsFromTariff(l.tariffName))
    const base = {
      id: String(l.id ?? `${card}:${hall}`),
      lineId: l.id,
      cardNumber: card,
      clientName: name,
      amount: Number(l.amount) || 0,
      hall,
      tariffName: String(l.tariffName ?? ''),
      matchStatus,
      clientId,
      matchedHallKind,
      matchedHalls: [...matchedHalls],
      packageMonths,
      trainerId: '',
      membershipTypeId: '',
      status: 'pending',
      error: '',
    }

    if (matchStatus === 'conflict') {
      actions.push({
        ...base,
        kind: 'card_conflict',
        label: 'Конфликт карты',
        error:
          String(l.matchReason ?? '').trim() ||
          `Два или больше клиентов с картой №${card} — разберите вручную в «Клиенты»`,
        status: 'pending',
      })
      continue
    }

    if (matchStatus === 'archived') {
      if (!clientId) {
        actions.push({
          ...base,
          kind: 'card_conflict',
          label: 'Архив без карточки',
          error:
            String(l.matchReason ?? '').trim() ||
            `Клиент с картой №${card} в архиве, но id не определён — откройте «Клиенты», не создавайте дубль`,
          status: 'pending',
        })
        continue
      }
      base.attachClientId = clientId
      base.needsRestore = true
      // Уже есть абон этого зала — только вернуть из архива, без второго абона
      if (matchedHalls.has(hall)) {
        actions.push({
          ...base,
          kind: 'restore_archived',
          label: 'Вернуть из архива',
        })
        continue
      }
    } else if (matchStatus === 'one' && clientId) {
      // Уже есть абон/контур этого зала — не предлагать «Создать» снова
      const alreadyHasHall =
        matchedHalls.has(hall) || !matchedHallKind || matchedHallKind === hall
      if (alreadyHasHall) {
        actions.push({
          ...base,
          kind: 'skip_matched',
          label: 'Уже в базе',
        })
        continue
      }
      // Другой зал на той же карте — допишем membership (не второй client)
      base.attachClientId = clientId
    }

    if (hall === 'pz') {
      const restore = Boolean(base.needsRestore)
      actions.push({
        ...base,
        kind: 'pz_need_trainer',
        label: restore
          ? 'ПЗ: вернуть из архива'
          : base.attachClientId
            ? 'ПЗ: абон к существующей карточке'
            : 'ПЗ: выбрать тренера',
      })
      continue
    }

    if (hall === 'az') {
      const dir = matchAzDirectionFromTariff(l.tariffName, azTypes)
      const restore = Boolean(base.needsRestore)
      actions.push({
        ...base,
        kind: 'az_desk',
        label: restore
          ? 'АЗ: вернуть из архива'
          : base.attachClientId
            ? 'АЗ: абон к карточке'
            : 'АЗ: desk-карточка',
        membershipTypeId: dir?.id ? String(dir.id) : '',
        membershipTypeLabel: dir ? String(dir.name || dir.code || '') : '',
      })
      continue
    }

    if (hall === 'tz') {
      const restore = Boolean(base.needsRestore)
      actions.push({
        ...base,
        kind: 'tz_desk',
        label: restore
          ? 'ТЗ: вернуть из архива'
          : base.attachClientId
            ? 'ТЗ: абон к карточке'
            : 'ТЗ: desk-карточка',
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
  if (kind === 'skip_matched' || kind === 'skip_cross_hall') return { ok: true }
  if (kind === 'restore_archived') {
    if (!String(action?.attachClientId || action?.clientId || '').trim()) {
      return { ok: false, error: 'Нет карточки для возврата из архива' }
    }
    return { ok: true }
  }
  if (kind === 'card_conflict') {
    return {
      ok: false,
      error: String(action?.error ?? '').trim() || 'Конфликт карты — сначала разберите дубли в «Клиенты»',
    }
  }

  const monthsOk = isPaymentLinkPackageMonthsReady(action?.packageMonths)

  if (kind === 'pz_need_trainer') {
    if (!monthsOk) return { ok: false, error: 'Укажите срок пакета' }
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
    if (!monthsOk) return { ok: false, error: 'Укажите срок пакета' }
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
  let cardConflict = 0
  let restorePending = 0
  let pzAmount = 0
  let pzReady = 0
  for (const a of actions ?? []) {
    if (a?.kind === 'skip_matched' || a?.kind === 'skip_cross_hall') {
      matched += 1
      continue
    }
    if (a?.kind === 'card_conflict') {
      cardConflict += 1
      continue
    }
    if (a?.status === 'done') {
      done += 1
      continue
    }
    if (a?.kind === 'restore_archived') {
      restorePending += 1
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
    cardConflict,
    restorePending,
    pzReady,
    pzAmount: Math.round(pzAmount),
    needWork: pzPending + deskPending + cardConflict + restorePending,
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
  /** @type {object[]} */
  const conflicts = []
  /** @type {object[]} */
  const restores = []
  for (const a of actions ?? []) {
    if (!a || a.status === 'done' || a.kind === 'skip_matched' || a.kind === 'skip_cross_hall') continue
    if (a.kind === 'card_conflict') conflicts.push(a)
    else if (a.kind === 'restore_archived') restores.push(a)
    else if (a.kind === 'pz_need_trainer') pz.push(a)
    else if (a.kind === 'az_desk' || a.kind === 'tz_desk') desk.push(a)
  }
  return { pz, desk, conflicts, restores }
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
