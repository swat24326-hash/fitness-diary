/**
 * Клип-карта: чистая логика статусов, чеклиста и «создать по клипу».
 * Без React / IDB.
 */

import { matchClientByCardThenPhone, normalizeSalesCardNumber } from './salesClientMatchCore.js'
import { formatClientName } from '../clientNameFormat.js'
import { todayLocalIso } from '../dateRu.js'
import { normalizeMembershipTotalTrainings } from '../membership/membershipTotalGuardCore.js'
import { isPnkTrialTypeRow } from '../pnk/pnkTrialTrainingCore.js'

export const SALE_CLIP_STATUSES = /** @type {const} */ (['awaiting', 'done', 'cancelled'])

/**
 * @param {object[]|null|undefined} membershipTypes
 * @returns {Map<string, object>}
 */
export function resolveMembershipTypesById(membershipTypes) {
  const m = new Map()
  for (const t of membershipTypes ?? []) {
    if (t?.id != null) m.set(String(t.id), t)
  }
  return m
}

/**
 * Без справочника типов: похоже на БЗ / пустую заглушку (нет оплаты и мало занятий).
 * @param {object|null|undefined} membership
 */
export function looksLikeNonPaidTrialMembership(membership) {
  const paid = Number(membership?.paid_amount)
  if (Number.isFinite(paid) && paid > 0) return false
  const total = Number(membership?.total_trainings)
  if (Number.isFinite(total) && total >= 4) return false
  return true
}

/**
 * Можно ли этим абоном закрыть заявку (auto-done).
 * БЗ/пробная ПНК не закрывает заявку на платный абон — иначе менеджер видит
 * «подтверждено планшетом», а платного абона нет (INC-2026-09-18-01).
 *
 * @param {object} clip
 * @param {object} membership
 * @param {Map<string, object>|Record<string, object>|null|undefined} [typesById]
 */
export function membershipMayCloseSaleClip(clip, membership, typesById) {
  if (!membership) return false
  const clipId = String(clip?.id ?? '').trim()
  if (clipId && String(membership.clip_id ?? '').trim() === clipId) return true

  const map =
    typesById instanceof Map
      ? typesById
      : typesById && typeof typesById === 'object'
        ? new Map(Object.entries(typesById))
        : null

  const memTypeId = String(membership.membership_type_id ?? membership.type_id ?? '').trim()
  const memType = memTypeId && map ? map.get(memTypeId) : null
  const memIsTrial = memType ? isPnkTrialTypeRow(memType) : looksLikeNonPaidTrialMembership(membership)

  const clipTypeId = String(clip?.membership_type_id ?? '').trim()
  const clipType = clipTypeId && map ? map.get(clipTypeId) : null
  const clipIsTrial = clipType ? isPnkTrialTypeRow(clipType) : false

  if (memIsTrial && !clipIsTrial) return false
  return true
}

/**
 * @param {unknown} raw
 * @returns {'awaiting'|'done'|'cancelled'}
 */
export function normalizeSaleClipStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'done' || s === 'cancelled') return s
  return 'awaiting'
}

/**
 * @param {object} draft
 * @returns {{ ok: true, clip: object } | { ok: false, reason: string }}
 */
export function validateSaleClipDraft(draft) {
  const clubId = String(draft?.club_id ?? '').trim()
  if (!clubId) return { ok: false, reason: 'Укажите клуб' }

  const name = formatClientName(draft?.client_name ?? draft?.name ?? '')
  if (!name) return { ok: false, reason: 'Укажите ФИО клиента' }

  const card = normalizeSalesCardNumber(draft?.card_number)
  const phone = String(draft?.phone ?? '').trim()
  if (!card && !phone) {
    return { ok: false, reason: 'Укажите номер карты или телефон (без карты поиск слабее)' }
  }

  const trainerId = String(draft?.trainer_id ?? '').trim()
  if (!trainerId) return { ok: false, reason: 'Укажите тренера для планшета' }

  const clipDate = String(draft?.clip_date ?? todayLocalIso()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clipDate)) {
    return { ok: false, reason: 'Некорректная дата клипа' }
  }

  let total = draft?.total_trainings
  if (total != null && total !== '') {
    total = Number(total)
    if (!Number.isFinite(total) || total < 0) {
      return { ok: false, reason: 'Число тренировок должно быть ≥ 0' }
    }
  } else {
    total = null
  }

  const start = draft?.start_date ? String(draft.start_date).slice(0, 10) : null
  const end = draft?.end_date ? String(draft.end_date).slice(0, 10) : null
  if (start && end && end < start) {
    return { ok: false, reason: 'Дата окончания раньше начала' }
  }

  return {
    ok: true,
    clip: {
      club_id: clubId,
      trainer_id: trainerId,
      client_id: draft?.client_id ? String(draft.client_id) : null,
      status: 'awaiting',
      clip_date: clipDate,
      client_name: name,
      phone: phone || null,
      card_number: card || null,
      birth_date: draft?.birth_date ? String(draft.birth_date).slice(0, 10) : null,
      membership_type_id: draft?.membership_type_id ? String(draft.membership_type_id) : null,
      membership_type_label: String(draft?.membership_type_label ?? '').trim() || null,
      total_trainings: total,
      start_date: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
      end_date: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null,
      note: String(draft?.note ?? '').trim().slice(0, 500) || null,
    },
  }
}

/**
 * Match + предупреждения перед create клипа.
 * @param {{
 *   clients: object[],
 *   membershipsByClientId?: Record<string, object[]>,
 *   draft: object,
 *   asOf?: string,
 * }} input
 */
export function planSaleClipCreate(input) {
  const validated = validateSaleClipDraft(input.draft)
  if (!validated.ok) {
    return { ok: false, reason: validated.reason, warnings: [], match: null, clip: null }
  }
  const clip = validated.clip
  const match = matchClientByCardThenPhone({
    clients: input.clients,
    cardNumber: clip.card_number,
    phone: clip.phone,
  })
  const warnings = []
  if (!clip.card_number) {
    warnings.push('Без номера карты — слабый поиск; лучше дописать карту с клип-карты')
  }
  if (match.status === 'conflict') {
    return {
      ok: false,
      reason: match.reason,
      warnings,
      match,
      clip: null,
    }
  }
  if (match.status === 'one') {
    clip.client_id = String(match.client.id)
    if (match.fillCard) {
      warnings.push(`На карточке нет карты — при сохранении допишем №${match.fillCard}`)
    }
    const mems = input.membershipsByClientId?.[clip.client_id] ?? []
    const asOf = String(input.asOf ?? todayLocalIso()).slice(0, 10)
    const live = mems.find((m) => {
      const s = String(m?.start_date ?? '').slice(0, 10)
      const e = String(m?.end_date ?? '').slice(0, 10)
      return s && e && s <= asOf && e >= asOf
    })
    if (live) {
      const until = String(live.end_date ?? '').slice(0, 10)
      warnings.push(
        until
          ? `Уже действует абонемент до ${until.split('-').reverse().join('.')} — клип = ещё одна продажа / продление явно`
          : 'Уже есть действующий абонемент — клип создаст ещё одну заявку',
      )
    }
    const life = String(match.client?.lifecycle ?? 'active')
    if (life === 'pnk') {
      warnings.push('Найден открытый ПНК — клип привяжется к этой карточке (promote), без второго человека')
    }
  } else if (match.status === 'none' || match.status === 'empty') {
    warnings.push('Клиент не найден — при создании клипа заведём карточку и заявку на планшет')
  }

  return { ok: true, reason: '', warnings, match, clip }
}

/**
 * Поля абонемента из клипа (для кнопки «создать по клипу»).
 * @param {object} clip
 * @param {string} [asOf]
 */
export function membershipFieldsFromSaleClip(clip, asOf = todayLocalIso()) {
  const today = String(asOf).slice(0, 10)
  const start = String(clip?.start_date ?? today).slice(0, 10)
  let end = clip?.end_date ? String(clip.end_date).slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const d = new Date(`${start}T12:00:00`)
    d.setMonth(d.getMonth() + 1)
    end = d.toISOString().slice(0, 10)
  }
  const rawTotal = clip?.total_trainings
  const hasExplicitTotal = rawTotal != null && String(rawTotal).trim() !== ''
  const noteHints = parseSaleClipNoteHints(clip?.note)
  const total_trainings = hasExplicitTotal
    ? normalizeMembershipTotalTrainings(rawTotal)
    : noteHints.totalFromNote != null
      ? noteHints.totalFromNote
      : null
  return {
    start_date: start,
    end_date: end,
    total_trainings,
    membership_type_id: clip?.membership_type_id ? String(clip.membership_type_id) : '',
    clip_id: clip?.id ? String(clip.id) : null,
    paid_amount_hint: noteHints.paidAmount,
  }
}

/**
 * Подсказки из заметки клипа: «Оплата 6151 ₽ · 8/1 Brilliant утро».
 * @param {unknown} note
 * @returns {{ paidAmount: number|null, totalFromNote: number|null }}
 */
export function parseSaleClipNoteHints(note) {
  const text = String(note ?? '')
  const paidMatch = text.match(/Оплата\s+([\d\s\u00a0]+)\s*₽/i)
  let paidAmount = null
  if (paidMatch) {
    const n = Number(String(paidMatch[1]).replace(/[\s\u00a0]/g, ''))
    if (Number.isFinite(n) && n > 0) paidAmount = n
  }
  const packMatch = text.match(/(\d+)\s*\/\s*\d+/)
  let totalFromNote = null
  if (packMatch) {
    const n = Number(packMatch[1])
    if (Number.isFinite(n) && n > 0) totalFromNote = Math.trunc(n)
  }
  return { paidAmount, totalFromNote }
}

/**
 * Абон, которым уже закрыта продажа по клипу (не создавать второй).
 * @param {object} clip
 * @param {object[]} membershipsForClient
 * @param {Map<string, object>|Record<string, object>|null|undefined} [typesById]
 * @returns {object|null}
 */
export function findMembershipFulfillingSaleClip(clip, membershipsForClient, typesById) {
  const clipId = String(clip?.id ?? '').trim()
  const list = (membershipsForClient ?? []).filter((m) =>
    membershipMayCloseSaleClip(clip, m, typesById),
  )
  if (clipId) {
    const byClip = list.find((m) => String(m?.clip_id ?? '').trim() === clipId)
    if (byClip) return byClip
  }
  const hints = parseSaleClipNoteHints(clip?.note)
  const clipDay = String(clip?.clip_date ?? clip?.start_date ?? '').slice(0, 10)
  const clipAt = Date.parse(String(clip?.created_at ?? ''))

  if (hints.paidAmount != null) {
    const byPay = list.find((m) => Number(m?.paid_amount) === hints.paidAmount)
    if (byPay) return byPay
  }

  const scored = []
  for (const m of list) {
    const total = Number(m?.total_trainings ?? 0)
    if (!(total > 0)) continue
    const start = String(m?.start_date ?? '').slice(0, 10)
    let score = 0
    if (hints.totalFromNote != null && total === hints.totalFromNote) score += 2
    if (clipDay && start && Math.abs(Date.parse(`${start}T12:00:00`) - Date.parse(`${clipDay}T12:00:00`)) <= 14 * 86400000) {
      score += 2
    }
    const mAt = Date.parse(String(m?.created_at ?? ''))
    if (Number.isFinite(clipAt) && Number.isFinite(mAt) && Math.abs(mAt - clipAt) <= 14 * 86400000) {
      score += 1
    }
    if (score >= 2) scored.push({ m, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.m ?? null
}

/**
 * Идемпотентность: клип уже done с membership_id.
 * @param {object} clip
 * @param {string} membershipId
 */
export function canMarkSaleClipDone(clip, membershipId) {
  const status = normalizeSaleClipStatus(clip?.status)
  if (status === 'cancelled') {
    return { ok: false, reason: 'Клип отменён — нельзя закрыть' }
  }
  if (status === 'done') {
    const mid = String(clip?.membership_id ?? '')
    if (mid && mid === String(membershipId ?? '')) {
      return { ok: true, reason: 'Клип уже закрыт этим абонементом', already: true }
    }
    if (mid) {
      return { ok: false, reason: 'Клип уже закрыт другим абонементом' }
    }
  }
  if (!membershipId) {
    return { ok: false, reason: 'Нет membership_id — сначала создайте абон по клипу' }
  }
  return { ok: true, reason: '', already: false }
}

/**
 * Мягкий чеклист дня (не блокирует отчёт).
 * @param {{
 *   clips?: object[],
 *   importErrors?: string[],
 *   asOf?: string,
 *   overdueAwaiting?: number,
 * }} input
 */
export function buildSaleDayChecklist(input) {
  const asOf = String(input.asOf ?? todayLocalIso()).slice(0, 10)
  const clips = (input.clips ?? []).filter((c) => String(c?.clip_date ?? '').slice(0, 10) === asOf)
  const awaiting = clips.filter((c) => normalizeSaleClipStatus(c.status) === 'awaiting')
  const withoutMatch = awaiting.filter((c) => !c?.client_id)
  const importErrors = (input.importErrors ?? []).filter(Boolean)
  const overdueAwaiting = Math.max(0, Number(input.overdueAwaiting) || 0)
  const items = []

  if (awaiting.length) {
    items.push({
      key: 'awaiting',
      level: 'warn',
      text: `Висят ${awaiting.length} клип(ов) «ждём планшет» — продажа ещё не подтверждена`,
    })
  }
  if (overdueAwaiting > 0) {
    items.push({
      key: 'overdue_awaiting',
      level: 'warn',
      text: `Ещё ${overdueAwaiting} заявок «ждём планшет» за другие дни — у тренера на Sync виден весь хвост`,
    })
  }
  if (withoutMatch.length) {
    items.push({
      key: 'no_client',
      level: 'warn',
      text: `${withoutMatch.length} клип(ов) без привязанного клиента — проверьте match`,
    })
  }
  if (importErrors.length) {
    items.push({
      key: 'import',
      level: 'error',
      text: `Импорт с ошибками: ${importErrors.slice(0, 3).join('; ')}${importErrors.length > 3 ? '…' : ''}`,
    })
  }

  return {
    asOf,
    closedSoft: items.length === 0,
    items,
    counts: {
      clipsToday: clips.length,
      awaiting: awaiting.length,
      overdueAwaiting,
      done: clips.filter((c) => normalizeSaleClipStatus(c.status) === 'done').length,
      withoutMatch: withoutMatch.length,
      importErrors: importErrors.length,
    },
  }
}

export {
  parseSaleClipPasteText,
  parseEveningInboundText,
  matchTrainerByNameHint,
  matchMembershipTypeByLabelHint,
  buildSaleClipFormPatchFromPaste,
} from './saleClipPasteCore.js'
