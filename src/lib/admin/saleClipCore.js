/**
 * Клип-карта: чистая логика статусов, чеклиста и «создать по клипу».
 * Без React / IDB.
 */

import { matchClientByCardThenPhone, normalizeSalesCardNumber } from './salesClientMatchCore.js'
import { formatClientName } from '../clientNameFormat.js'
import { todayLocalIso } from '../dateRu.js'
import { normalizeMembershipTotalTrainings } from '../membership/membershipTotalGuardCore.js'

export const SALE_CLIP_STATUSES = /** @type {const} */ (['awaiting', 'done', 'cancelled'])

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
  return {
    start_date: start,
    end_date: end,
    total_trainings:
      Number(clip?.total_trainings) >= 0
        ? normalizeMembershipTotalTrainings(clip.total_trainings)
        : 12,
    membership_type_id: clip?.membership_type_id ? String(clip.membership_type_id) : '',
    clip_id: clip?.id ? String(clip.id) : null,
  }
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

/**
 * Парсинг «входящего» текста: карта / телефон / ФИО (эвристика).
 * @param {string} raw
 */
export function parseEveningInboundText(raw) {
  const full = parseSaleClipPasteText(raw)
  return {
    cardNumber: full.cardNumber,
    phone: full.phone,
    name: full.name,
    reason: full.reason,
  }
}

/**
 * Парсинг типичного текста клип-карты / переписки → поля заявки.
 * @param {string} raw
 * @returns {{
 *   cardNumber: string,
 *   phone: string,
 *   name: string,
 *   totalTrainings: number|null,
 *   membershipTypeLabel: string,
 *   startDate: string|null,
 *   endDate: string|null,
 *   trainerHint: string,
 *   birthDate: string|null,
 *   reason: string,
 *   warnings: string[],
 *   understood: string[],
 * }}
 */
export function parseSaleClipPasteText(raw) {
  const text = String(raw ?? '').trim()
  const warnings = []
  const understood = []
  if (!text) {
    return {
      cardNumber: '',
      phone: '',
      name: '',
      totalTrainings: null,
      membershipTypeLabel: '',
      startDate: null,
      endDate: null,
      trainerHint: '',
      birthDate: null,
      reason: 'Пустой текст — вставьте текст с клип-карты или из переписки',
      warnings: ['Пустой текст'],
      understood: [],
    }
  }

  let cardNumber = ''
  const cardM = text.match(/(?:карт[аые]?|card|№)\s*[:.]?\s*([a-zа-яё]?\d{3,6})/i)
  if (cardM) cardNumber = normalizeSalesCardNumber(cardM[1])
  if (!cardNumber) {
    const lone = text.match(/\b([a-zа-яё]?\d{3,6})\b/i)
    if (lone && /(?:карт|card|№)/i.test(text)) cardNumber = normalizeSalesCardNumber(lone[1])
  }
  if (cardNumber) understood.push(`карта ${cardNumber}`)

  let phone = ''
  const phoneM = text.match(/(?:\+?7|8)?[\s(]*\d{3}[\s)]*\d{3}[\s-]?\d{2}[\s-]?\d{2}/)
  if (phoneM) {
    phone = phoneM[0]
    understood.push('телефон')
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  let name = ''
  for (const line of lines) {
    if (/(карт|тел|phone|абонемент|vip|тренер|тренир|начал|оконч|дата|\d{3,})/i.test(line)) continue
    if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(line)) continue
    if (/^[а-яёa-z\s\-']{5,80}$/i.test(line)) {
      name = formatClientName(line)
      break
    }
  }
  if (!name) {
    const fioM = text.match(/(?:фио|клиент|имя)\s*[:.\-–—]?\s*([а-яёa-z\s\-']{5,80})/i)
    if (fioM) name = formatClientName(fioM[1])
  }
  if (name) understood.push(`ФИО ${name}`)

  let totalTrainings = null
  const trM = text.match(/(\d{1,3})\s*(?:трен|занят|посещ)/i)
  if (trM) {
    totalTrainings = Number(trM[1])
    understood.push(`${totalTrainings} тренировок`)
  }

  let membershipTypeLabel = ''
  const typeM = text.match(
    /(?:тип|абонемент|тариф|пакет)\s*[:.\-–—]?\s*([^\n,;]{2,40})/i,
  )
  if (typeM) {
    membershipTypeLabel = typeM[1].trim()
    understood.push(`тип «${membershipTypeLabel}»`)
  } else {
    const vipM = text.match(/\b(VIP\s*\d+|БЗ|ПНК|без\s*лимит[а]?)(?:\b|$)/i)
    if (vipM) {
      membershipTypeLabel = vipM[1].replace(/\s+/g, ' ').trim()
      understood.push(`тип «${membershipTypeLabel}»`)
    }
  }

  /** @param {string} s */
  function toIsoDate(s) {
    const t = String(s ?? '').trim()
    const dmy = t.match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    return null
  }

  let startDate = null
  let endDate = null
  const rangeM = text.match(
    /(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})\s*[-–—допо]+\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i,
  )
  if (rangeM) {
    startDate = toIsoDate(rangeM[1])
    endDate = toIsoDate(rangeM[2])
  }
  if (!startDate) {
    const sm = text.match(/(?:начал|с\s*|start)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i)
    if (sm) startDate = toIsoDate(sm[1])
  }
  if (!endDate) {
    const em = text.match(/(?:оконч|до\s*|end|по\s*)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i)
    if (em) endDate = toIsoDate(em[1])
  }
  if (startDate) understood.push(`начало ${startDate}`)
  if (endDate) understood.push(`окончание ${endDate}`)

  let birthDate = null
  const bdM = text.match(/(?:рожд|др|birth)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i)
  if (bdM) {
    birthDate = toIsoDate(bdM[1])
    if (birthDate) understood.push('дата рождения')
  }

  let trainerHint = ''
  const thM = text.match(/(?:тренер|coach)\s*[:.\-–—]?\s*([а-яёa-z\s\-']{2,40})/i)
  if (thM) {
    trainerHint = formatClientName(thM[1].split(/[,;(]/)[0])
    understood.push(`тренер «${trainerHint}»`)
  }

  if (!cardNumber && !phone) {
    warnings.push('Не нашла карту и телефон — допишите вручную')
  } else if (!cardNumber) {
    warnings.push('Нет номера карты — поиск слабый')
  }
  if (!name) warnings.push('Не нашла ФИО — допишите')
  if (!trainerHint) warnings.push('В тексте нет тренера — выберите в списке')

  const reason = understood.length
    ? `Поняла: ${understood.join(', ')}`
    : 'Программа почти ничего не поняла — заполните поля вручную'

  return {
    cardNumber,
    phone,
    name,
    totalTrainings,
    membershipTypeLabel,
    startDate,
    endDate,
    trainerHint,
    birthDate,
    reason,
    warnings,
    understood,
  }
}

/**
 * Найти тренера по подсказке из текста (фамилия / часть имени).
 * @param {object[]} trainers
 * @param {string} hint
 * @returns {{ status: 'none'|'one'|'conflict', trainer?: object, matches: object[], reason: string }}
 */
export function matchTrainerByNameHint(trainers, hint) {
  const q = String(hint ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!q || q.length < 2) {
    return { status: 'none', matches: [], reason: 'Нет имени тренера в тексте' }
  }
  const list = (trainers ?? []).filter((t) => t && !String(t.name ?? '').toLowerCase().includes('не назначен'))
  const matches = list.filter((t) => {
    const n = String(t.name ?? '')
      .trim()
      .toLowerCase()
    if (!n) return false
    return n.includes(q) || q.includes(n) || n.split(/\s+/).some((part) => part.startsWith(q) || q.startsWith(part))
  })
  if (matches.length === 1) {
    return {
      status: 'one',
      trainer: matches[0],
      matches,
      reason: `Тренер: ${matches[0].name}`,
    }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      matches,
      reason: `Несколько тренеров похожи на «${hint}» — выберите вручную`,
    }
  }
  return { status: 'none', matches: [], reason: `Тренер «${hint}» не найден в клубе — выберите из списка` }
}
