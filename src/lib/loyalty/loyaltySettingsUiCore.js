/**
 * Тексты и черновик вкладки Структура → Лояльность. Без React / fetch.
 */

import { normalizeEnabledIntervals } from './loyaltyEnabledCore.js'
import { normalizeLoyaltySettings } from './loyaltySettingsCore.js'

export const LOYALTY_SETTINGS_TAB_ID = 'loyalty'
export const LOYALTY_SETTINGS_TAB_LABEL = 'Лояльность'

export const LOYALTY_DISABLE_CONFIRM =
  'Выключить программу в этом клубе? Персоналки сегодня ещё капают. Со следующего дня набор остановится. Списать куш будет нельзя, пока снова не включите.'

export const LOYALTY_ENABLE_CONFIRM =
  'Включить баллы в этом клубе? Цикл начнётся с первой подходящей персоналки начиная с сегодняшнего дня (по Москве). Старые дневники до этого дня не считаются.'

export const LOYALTY_SETTINGS_OFFLINE = 'Сохранение только при сети.'
export const LOYALTY_SETTINGS_NEED_CLUB = 'Выберите клуб в шапке.'
export const LOYALTY_SETTINGS_ADMIN_ONLY = 'Менять программу может только администратор.'
export const LOYALTY_SETTINGS_MIGRATION =
  'Нужна миграция лояльности (npm run db:migrate:loyalty -- --linked).'

/**
 * @param {unknown} settings
 */
export function loyaltySettingsToDraft(settings) {
  const s = normalizeLoyaltySettings(settings)
  return {
    enabled: s.enabled === true,
    cycle_months: String(s.cycle_months),
    points_per_week: String(s.points_per_week),
    kcal_chunk: String(s.kcal_chunk),
    points_per_kcal_chunk: String(s.points_per_kcal_chunk),
    max_minutes: String(s.max_minutes),
    max_kcal_per_training: String(s.max_kcal_per_training),
  }
}

/**
 * @param {object} draft
 * @param {string} clubId
 */
export function loyaltyDraftToPostBody(draft, clubId) {
  const s = normalizeLoyaltySettings({
    enabled: draft?.enabled === true,
    cycle_months: draft?.cycle_months,
    points_per_week: draft?.points_per_week,
    kcal_chunk: draft?.kcal_chunk,
    points_per_kcal_chunk: draft?.points_per_kcal_chunk,
    max_minutes: draft?.max_minutes,
    max_kcal_per_training: draft?.max_kcal_per_training,
  })
  return {
    club_id: String(clubId ?? '').trim(),
    enabled: s.enabled,
    cycle_months: s.cycle_months,
    points_per_week: s.points_per_week,
    kcal_chunk: s.kcal_chunk,
    points_per_kcal_chunk: s.points_per_kcal_chunk,
    max_minutes: s.max_minutes,
    max_kcal_per_training: s.max_kcal_per_training,
  }
}

/**
 * Интервалы шлёт только сервер через applyProgramToggle — UI их не редактирует.
 * @param {object} body
 */
export function loyaltySettingsPostOmitsIntervals(body) {
  return body != null && typeof body === 'object' && !Object.prototype.hasOwnProperty.call(body, 'enabled_intervals')
}

/**
 * @param {boolean} prevEnabled
 * @param {boolean} nextEnabled
 * @returns {string}
 */
export function loyaltyToggleConfirmText(prevEnabled, nextEnabled) {
  if (prevEnabled === true && nextEnabled !== true) return LOYALTY_DISABLE_CONFIRM
  if (prevEnabled !== true && nextEnabled === true) return LOYALTY_ENABLE_CONFIRM
  return ''
}

/**
 * @param {unknown} intervals
 */
export function formatLoyaltyIntervals(intervals) {
  const list = normalizeEnabledIntervals(intervals)
  if (!list.length) return 'Программа ещё не включалась — баллы не капают.'
  return list
    .map((iv) => (iv.end ? `${iv.start} — ${iv.end}` : `${iv.start} — открыт`))
    .join('; ')
}

/**
 * @param {{ enabled?: boolean, enabled_at?: string | null }} settings
 */
export function formatLoyaltyProgramStatus(settings) {
  const s = normalizeLoyaltySettings(settings)
  if (s.enabled) {
    const since = s.enabled_at ? ` с ${s.enabled_at}` : ''
    return `Программа включена${since}. Персоналки в открытом интервале копят баллы.`
  }
  if (s.enabled_at) return 'Программа выключена. Накопленное не сбрасывается; списать куш нельзя.'
  return 'Программа выключена. Включите, чтобы персоналки начали копилку.'
}

/**
 * @param {{
 *   clubId?: string,
 *   isAdmin?: boolean,
 *   online?: boolean,
 *   busy?: boolean,
 *   migrationNeeded?: boolean,
 * }} p
 */
export function loyaltySettingsSaveState(p = {}) {
  const clubId = String(p.clubId ?? '').trim()
  if (!clubId) return { canSave: false, reason: LOYALTY_SETTINGS_NEED_CLUB }
  if (p.isAdmin !== true) return { canSave: false, reason: LOYALTY_SETTINGS_ADMIN_ONLY }
  if (p.online !== true) return { canSave: false, reason: LOYALTY_SETTINGS_OFFLINE }
  if (p.migrationNeeded === true) return { canSave: false, reason: LOYALTY_SETTINGS_MIGRATION }
  if (p.busy === true) return { canSave: false, reason: '' }
  return { canSave: true, reason: '' }
}

/**
 * HTTP GET/POST loyalty-settings → снимок для экрана. Не выдумываем «включено».
 * @param {number} status
 * @param {object|null|undefined} data
 */
export function interpretLoyaltySettingsHttp(status, data) {
  const body = data && typeof data === 'object' ? data : {}
  const code = Number(status)
  if (code === 503 || body.migration_needed === true) {
    return {
      ok: true,
      migration_needed: true,
      settings: normalizeLoyaltySettings({ enabled: false }),
      error: '',
    }
  }
  if (!Number.isFinite(code) || code >= 400 || body.ok === false) {
    return {
      ok: false,
      migration_needed: false,
      settings: normalizeLoyaltySettings({ enabled: false }),
      error: String(body.error || `Ошибка сервера (${status})`),
    }
  }
  return {
    ok: true,
    migration_needed: false,
    settings: normalizeLoyaltySettings(body.settings ?? {}),
    error: '',
  }
}
