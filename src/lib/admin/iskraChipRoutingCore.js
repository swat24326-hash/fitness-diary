/**
 * Маршрутизация быстрых кнопок ИСКРЫ: instant vs Gemini.
 * Для app_admin аналитика продаж идёт в Gemini (standard/deep), не в шаблон.
 */

/** Мгновенный ответ (приветствие, короткие чипы). */
export const ISKRA_ALWAYS_INSTANT_CHIP_IDS = new Set([
  'intro',
  'fitcity',
  'pnk',
  'bestday',
])

/** База знаний приложения — для app_admin через Gemini с app_knowledge. */
export const ISKRA_APP_KB_CHIP_IDS = new Set(['app_guide', 'app_sync', 'app_structure'])

/** Тренерские чипы — данные из trainer_contour, instant достаточен. */
export const ISKRA_TRAINER_CHIP_IDS = new Set([
  'trainer_inactive',
  'trainer_trainings',
  'trainer_salary',
  'trainer_clients',
  'trainer_no_type',
  'trainer_rank',
  'trainer_summary',
  'payroll_gap',
])

/** Аналитика продаж — для админа через Gemini. */
export const ISKRA_GEMINI_ANALYTICS_CHIP_IDS = new Set([
  'advice',
  'advice_plan',
  'plan',
  'gap',
  'compare',
  'sales_structure',
  'finance',
  'month_forecast',
  'sales_coverage',
  'sales_refunds',
  'sales_directions',
])

/**
 * @param {string | null | undefined} chipId
 * @param {string} [advisorRoleId]
 */
export function shouldRouteChipToGemini(chipId, advisorRoleId = 'app_admin') {
  const id = String(chipId ?? '').trim()
  if (!id) return false
  if (ISKRA_ALWAYS_INSTANT_CHIP_IDS.has(id)) return false
  if (ISKRA_TRAINER_CHIP_IDS.has(id)) return false
  if (advisorRoleId === 'app_admin' && ISKRA_APP_KB_CHIP_IDS.has(id)) return true
  if (advisorRoleId !== 'app_admin') return false
  return ISKRA_GEMINI_ANALYTICS_CHIP_IDS.has(id)
}

/**
 * Опции отправки при клике на чип в панели.
 * @param {{ id?: string, handler_id?: string | null }} chip
 * @param {{ advisorRoleId?: string, responseDepth?: string }} opts
 */
export function resolveChipSendOptions(chip, opts = {}) {
  const handlerId = String(chip?.handler_id ?? chip?.id ?? '').trim()
  const advisorRoleId = String(opts.advisorRoleId ?? 'app_admin').trim()
  const responseDepth = String(opts.responseDepth ?? 'standard').trim() || 'standard'

  if (handlerId && shouldRouteChipToGemini(handlerId, advisorRoleId)) {
    return {
      handlerId: undefined,
      responseMode: responseDepth === 'deep' ? 'deep' : 'standard',
      forceGemini: false,
    }
  }

  return {
    handlerId: handlerId || undefined,
    responseMode: handlerId ? 'brief' : responseDepth,
    forceGemini: false,
  }
}
