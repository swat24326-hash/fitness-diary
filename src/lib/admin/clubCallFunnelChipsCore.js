/**
 * Чипы следующего шага продажи после клубного звонка (воронка, не webhook-исход).
 * Без React / IDB.
 */

import { addCalendarDaysIso, formatDateRu, todayLocalIso } from '../dateRu.js'

/** @typedef {'open' | 'close'} ClubCallFunnelChipKind */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   note: string,
 *   kind: ClubCallFunnelChipKind,
 *   needsCallbackOn?: boolean,
 * }} ClubCallFunnelChip
 */

/** Горизонты для «Перезвонить · дата». */
export const CLUB_CALL_CALLBACK_HORIZONS = Object.freeze([
  { id: '1d', label: 'Завтра', days: 1 },
  { id: '3d', label: 'Через 3 дня', days: 3 },
  { id: '7d', label: 'Через неделю', days: 7 },
  { id: 'custom', label: 'Своя дата', days: null },
])

/**
 * Единый каталог: лист после набора + пометка в журнале.
 * Не дублирует webhook (дозвон/не взял/сброс) как «правду исхода» —
 * «Не взял» здесь = быстрый следующий шаг до прихода finish.
 * @type {ReadonlyArray<ClubCallFunnelChip>}
 */
export const CLUB_CALL_FUNNEL_CHIPS = Object.freeze([
  { id: 'no_answer', label: 'Не взял', note: 'Не взял — перезвонить', kind: 'open' },
  { id: 'busy', label: 'Занят', note: 'Занят — перезвонить', kind: 'open' },
  { id: 'callback_today', label: 'Перезвонить сегодня', note: 'Перезвонить сегодня', kind: 'open' },
  {
    id: 'callback_later',
    label: 'Перезвонить · дата',
    note: 'Перезвонить',
    kind: 'open',
    needsCallbackOn: true,
  },
  { id: 'thinks_uk', label: 'Думает про УК', note: 'Думает про УК', kind: 'open' },
  { id: 'thinks_nk', label: 'Думает · НК', note: 'Думает · НК', kind: 'open' },
  { id: 'waiting_offer', label: 'Ждёт условия', note: 'Ждёт условия / цену', kind: 'open' },
  { id: 'refused', label: 'Отказ', note: 'Отказ', kind: 'close' },
  { id: 'bought', label: 'Купил / оформил', note: 'Купил / оформил', kind: 'close' },
  { id: 'do_not_call', label: 'Не звонить', note: 'Не звонить', kind: 'close' },
  { id: 'wrong_number', label: 'Не тот номер', note: 'Не тот номер', kind: 'close' },
])

/** @deprecated alias — старый лист звонка */
export const CLUB_CALL_SHEET_NOTE_CHIPS = CLUB_CALL_FUNNEL_CHIPS

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeClubCallFunnelChipId(raw) {
  const id = String(raw ?? '').trim()
  if (!id) return null
  return CLUB_CALL_FUNNEL_CHIPS.some((c) => c.id === id) ? id : null
}

/**
 * @param {string|null|undefined} chipId
 * @returns {ClubCallFunnelChip | null}
 */
export function getClubCallFunnelChip(chipId) {
  const id = normalizeClubCallFunnelChipId(chipId)
  if (!id) return null
  return CLUB_CALL_FUNNEL_CHIPS.find((c) => c.id === id) ?? null
}

export function isClubCallFunnelOpenChip(chipId) {
  return getClubCallFunnelChip(chipId)?.kind === 'open'
}

export function isClubCallFunnelCloseChip(chipId) {
  return getClubCallFunnelChip(chipId)?.kind === 'close'
}

/**
 * @param {unknown} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function normalizeClubCallCallbackOn(raw) {
  const s = String(raw ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/**
 * @param {string} [asOf]
 * @param {string|null|undefined} horizonId
 * @param {string|null|undefined} customDate
 */
export function resolveClubCallCallbackOn(asOf, horizonId, customDate) {
  const id = String(horizonId ?? '').trim()
  if (!id) return null
  if (id === 'custom') return normalizeClubCallCallbackOn(customDate)
  const h = CLUB_CALL_CALLBACK_HORIZONS.find((x) => x.id === id)
  if (!h || h.days == null) return null
  const base = normalizeClubCallCallbackOn(asOf) || todayLocalIso()
  return addCalendarDaysIso(base, h.days)
}

/**
 * Текст пометки из чипа (+ дата для callback_later).
 * @param {{ chipId?: string|null, callbackOn?: string|null, customText?: string|null }} input
 * @param {number} [maxLen]
 */
export function composeClubCallFunnelNote(input, maxLen = 400) {
  const chip = getClubCallFunnelChip(input?.chipId)
  const custom = String(input?.customText ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  let base = ''
  if (chip) {
    if (chip.needsCallbackOn) {
      const d = normalizeClubCallCallbackOn(input?.callbackOn)
      if (!d) return null
      base = `${chip.note} · до ${formatDateRu(d)}`
    } else {
      base = chip.note
    }
  } else if (custom) {
    base = custom
  } else {
    return null
  }
  if (custom && chip && custom !== base && !custom.startsWith(chip.note)) {
    base = `${base} · ${custom}`
  } else if (custom && !chip) {
    base = custom
  }
  const max = Number(maxLen) > 0 ? Math.floor(Number(maxLen)) : 400
  return base.length <= max ? base : base.slice(0, max)
}

/**
 * Готовность UI: чип выбран; для callback_later нужна дата.
 * @param {{ chipId?: string|null, callbackOn?: string|null, customText?: string|null }} input
 */
export function isClubCallFunnelNoteReady(input) {
  const chip = getClubCallFunnelChip(input?.chipId)
  if (chip) {
    if (chip.needsCallbackOn) return Boolean(normalizeClubCallCallbackOn(input?.callbackOn))
    return true
  }
  return Boolean(String(input?.customText ?? '').trim())
}

/**
 * Подставить текст чипа в черновик (лист / журнал).
 * @param {string} chipNote
 * @param {number} [maxLen]
 */
export function clubCallSheetNoteFromChip(chipNote, maxLen = 400) {
  const t = String(chipNote ?? '').trim()
  if (!t) return ''
  const max = Number(maxLen) > 0 ? Math.floor(Number(maxLen)) : 400
  return t.length <= max ? t : t.slice(0, max)
}

/**
 * Подобрать чип по сохранённым полям / тексту (редактирование).
 * @param {{ staff_note_chip_id?: unknown, staff_note?: unknown, callback_on?: unknown }} row
 */
export function matchClubCallFunnelChip(row) {
  const byId = normalizeClubCallFunnelChipId(row?.staff_note_chip_id)
  if (byId) {
    return {
      chipId: byId,
      callbackOn: normalizeClubCallCallbackOn(row?.callback_on),
    }
  }
  const note = String(row?.staff_note ?? '').trim()
  if (!note) return { chipId: null, callbackOn: null }
  const exact = CLUB_CALL_FUNNEL_CHIPS.find((c) => !c.needsCallbackOn && c.note === note)
  if (exact) return { chipId: exact.id, callbackOn: null }
  const later = note.match(/^Перезвонить · до (\d{2})\.(\d{2})\.(\d{4})/i)
  if (later) {
    return {
      chipId: 'callback_later',
      callbackOn: `${later[3]}-${later[2]}-${later[1]}`,
    }
  }
  const prefixed = CLUB_CALL_FUNNEL_CHIPS.find(
    (c) => !c.needsCallbackOn && (note === c.note || note.startsWith(`${c.note} ·`)),
  )
  if (prefixed) {
    return {
      chipId: prefixed.id,
      callbackOn: normalizeClubCallCallbackOn(row?.callback_on),
    }
  }
  return { chipId: null, callbackOn: normalizeClubCallCallbackOn(row?.callback_on) }
}

/**
 * Подобрать горизонт по сохранённой дате.
 * @param {string|null|undefined} callbackOn
 * @param {string} [asOf]
 */
export function matchClubCallCallbackHorizon(callbackOn, asOf = todayLocalIso()) {
  const d = normalizeClubCallCallbackOn(callbackOn)
  if (!d) return { horizonId: null, customDate: '' }
  const base = normalizeClubCallCallbackOn(asOf) || todayLocalIso()
  for (const h of CLUB_CALL_CALLBACK_HORIZONS) {
    if (h.days == null) continue
    if (addCalendarDaysIso(base, h.days) === d) {
      return { horizonId: h.id, customDate: '' }
    }
  }
  return { horizonId: 'custom', customDate: d }
}
