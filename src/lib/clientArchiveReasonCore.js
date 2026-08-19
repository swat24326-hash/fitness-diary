/**
 * Причина архива клиента — одна правда на карточке.
 * При возврате в работу причина очищается вместе с archived_at.
 */

export const ARCHIVE_REASON_MAX_LEN = 200

export const ARCHIVE_REASON_OTHER_ID = 'other'

/** Быстрые чипы на планшете (подпись = значение в БД, кроме «Другое»). */
export const ARCHIVE_REASON_CHIPS = Object.freeze([
  { id: 'never_return', label: 'Не вернётся' },
  { id: 'return_later', label: 'Вернётся позже' },
  { id: 'no_show', label: 'Не ходит / пропал' },
  { id: 'expensive', label: 'Дорого / нет денег' },
  { id: 'health', label: 'Здоровье' },
  { id: 'moved', label: 'Переехал / другой зал' },
  { id: 'other_coach', label: 'К другому тренеру' },
  { id: 'unhappy', label: 'Недоволен' },
  { id: ARCHIVE_REASON_OTHER_ID, label: 'Другое' },
])

/**
 * Старые подписи — только для match и mix KPI (не показываем в модалке).
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const ARCHIVE_REASON_LEGACY_CHIPS = Object.freeze([
  { id: 'not_renewed', label: 'Закончил / не продлил' },
  { id: 'expensive', label: 'Дорого / финансы' },
])

/** @type {ReadonlyArray<{ id: string, label: string }>} */
export const ARCHIVE_REASON_MIX_GROUPS = Object.freeze([
  ...ARCHIVE_REASON_CHIPS.filter((c) => c.id !== ARCHIVE_REASON_OTHER_ID),
  ...ARCHIVE_REASON_LEGACY_CHIPS.filter(
    (legacy) => !ARCHIVE_REASON_CHIPS.some((c) => c.id === legacy.id),
  ),
  { id: ARCHIVE_REASON_OTHER_ID, label: 'Другое / свой текст' },
])

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeArchiveReasonText(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, ARCHIVE_REASON_MAX_LEN)
}

/**
 * Собрать текст причины из чипа и/или свободного поля.
 * @param {{ chipId?: string | null, customText?: string | null }} input
 * @returns {string | null}
 */
export function composeArchiveReason(input) {
  const chipId = String(input?.chipId ?? '').trim()
  const custom = normalizeArchiveReasonText(input?.customText)
  if (chipId && chipId !== ARCHIVE_REASON_OTHER_ID) {
    const chip = ARCHIVE_REASON_CHIPS.find((c) => c.id === chipId)
    if (chip?.label) return normalizeArchiveReasonText(chip.label)
  }
  return custom
}

/**
 * @param {unknown} reason
 */
export function isArchiveReasonReady(reason) {
  return Boolean(normalizeArchiveReasonText(reason))
}

/**
 * @param {{ archive_reason?: unknown } | null | undefined} client
 * @returns {string | null}
 */
export function getClientArchiveReason(client) {
  return normalizeArchiveReasonText(client?.archive_reason)
}

/**
 * @param {{ archive_reason?: unknown } | null | undefined} client
 */
export function clientHasArchiveReason(client) {
  return Boolean(getClientArchiveReason(client))
}

/**
 * Архивный без пометки — нужна кнопка «Указать причину».
 * @param {{ archived_at?: unknown, archive_reason?: unknown } | null | undefined} client
 */
export function clientNeedsArchiveReason(client) {
  return Boolean(client?.archived_at) && !clientHasArchiveReason(client)
}

/**
 * Живой клиент, но причина архива осталась (баг старого restore / оплат).
 * @param {{ archived_at?: unknown, archive_reason?: unknown } | null | undefined} client
 */
export function clientHasStaleArchiveReason(client) {
  return !client?.archived_at && clientHasArchiveReason(client)
}

/**
 * Подпись для списка / карточки.
 * @param {{ archived_at?: unknown, archive_reason?: unknown } | null | undefined} client
 * @returns {string | null}
 */
export function formatArchiveReasonDisplay(client) {
  const r = getClientArchiveReason(client)
  if (r) return r
  if (client?.archived_at) return 'Без причины'
  return null
}

/**
 * Поля при уходе в архив (причина обязательна).
 * @param {unknown} reason
 * @param {string} [nowIso]
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function buildArchiveEnterFields(reason, nowIso = new Date().toISOString()) {
  const r = normalizeArchiveReasonText(reason)
  if (!r) return { ok: false, error: 'Укажите причину архива' }
  return {
    ok: true,
    patch: {
      archived_at: nowIso,
      archive_reason: r,
      archive_reason_at: nowIso,
    },
  }
}

/** Поля при возврате в работу — дата и причина сбрасываются. */
export function buildArchiveRestoreFields() {
  return {
    archived_at: null,
    archive_reason: null,
    archive_reason_at: null,
  }
}

/**
 * Слить возврат из архива в строку клиента (оплаты / Sync / UI).
 * @param {object} existing
 * @param {Record<string, unknown>} [extra]
 */
export function withArchiveRestore(existing, extra = {}) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...extra,
    ...buildArchiveRestoreFields(),
  }
}

/**
 * Только пометка причины у уже архивного клиента.
 * @param {unknown} reason
 * @param {string} [nowIso]
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function buildArchiveReasonOnlyFields(reason, nowIso = new Date().toISOString()) {
  const r = normalizeArchiveReasonText(reason)
  if (!r) return { ok: false, error: 'Укажите причину архива' }
  return {
    ok: true,
    patch: {
      archive_reason: r,
      archive_reason_at: nowIso,
    },
  }
}

/**
 * Подобрать чип по сохранённому тексту (для модалки «изменить»).
 * @param {unknown} reasonText
 * @returns {{ chipId: string | null, customText: string }}
 */
export function matchArchiveReasonChip(reasonText) {
  const r = normalizeArchiveReasonText(reasonText)
  if (!r) return { chipId: null, customText: '' }
  const pools = [
    ...ARCHIVE_REASON_CHIPS.filter((c) => c.id !== ARCHIVE_REASON_OTHER_ID),
    ...ARCHIVE_REASON_LEGACY_CHIPS,
  ]
  const chip = pools.find((c) => c.label === r)
  if (chip) return { chipId: chip.id, customText: '' }
  return { chipId: ARCHIVE_REASON_OTHER_ID, customText: r }
}

/**
 * Начальное состояние модалки: только чипы из UI, legacy → «Другое» + текст.
 * @param {unknown} reasonText
 */
export function resolveArchiveReasonModalState(reasonText) {
  const matched = matchArchiveReasonChip(reasonText)
  const uiChip = ARCHIVE_REASON_CHIPS.find((c) => c.id === matched.chipId)
  if (uiChip && uiChip.id !== ARCHIVE_REASON_OTHER_ID) {
    return { chipId: uiChip.id, customText: '' }
  }
  const text = matched.customText || normalizeArchiveReasonText(reasonText) || ''
  if (text) return { chipId: ARCHIVE_REASON_OTHER_ID, customText: text }
  return { chipId: null, customText: '' }
}
