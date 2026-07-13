/**
 * Персона и настройки ИСКРА-Куратор: тон, привычки, планирование.
 * scripts/verify-iskra-curator-contour.mjs
 */

/** @typedef {'supportive'|'direct'|'coach'|'calm'} IskraCuratorTone */

/** @typedef {'light'|'medium'|'deep'} IskraCuratorDepth */

/**
 * @typedef {{
 *   tone?: IskraCuratorTone,
 *   depth?: IskraCuratorDepth,
 *   habit_check_enabled?: boolean,
 *   morning_brief_enabled?: boolean,
 *   companion_mode_default?: boolean,
 *   health_reminders_enabled?: boolean,
 *   business_bridge_enabled?: boolean,
 * }} IskraCuratorPersonaSettings
 */

export const ISKRA_CURATOR_TONE_LABELS = {
  supportive: 'Поддерживающий — мягко, без давления',
  direct: 'Прямой — коротко и по делу',
  coach: 'Коуч — вопросы и шаги',
  calm: 'Спокойный — для вечера и рефлексии',
}

export const DEFAULT_CURATOR_PERSONA = /** @type {IskraCuratorPersonaSettings} */ ({
  tone: 'supportive',
  depth: 'medium',
  habit_check_enabled: true,
  morning_brief_enabled: true,
  companion_mode_default: false,
  health_reminders_enabled: true,
  business_bridge_enabled: true,
})

/**
 * @param {IskraCuratorPersonaSettings | null | undefined} raw
 * @returns {IskraCuratorPersonaSettings}
 */
export function normalizeCuratorPersonaSettings(raw) {
  const tone = String(raw?.tone ?? DEFAULT_CURATOR_PERSONA.tone)
  const depth = String(raw?.depth ?? DEFAULT_CURATOR_PERSONA.depth)
  return {
    tone: ['supportive', 'direct', 'coach', 'calm'].includes(tone)
      ? /** @type {IskraCuratorTone} */ (tone)
      : DEFAULT_CURATOR_PERSONA.tone,
    depth: ['light', 'medium', 'deep'].includes(depth)
      ? /** @type {IskraCuratorDepth} */ (depth)
      : DEFAULT_CURATOR_PERSONA.depth,
    habit_check_enabled: raw?.habit_check_enabled !== false,
    morning_brief_enabled: raw?.morning_brief_enabled !== false,
    companion_mode_default: raw?.companion_mode_default === true,
    health_reminders_enabled: raw?.health_reminders_enabled !== false,
    business_bridge_enabled: raw?.business_bridge_enabled === true,
  }
}

/**
 * @param {IskraCuratorPersonaSettings} settings
 * @param {import('./iskraCuratorContourCore.js').IskraCuratorMode} [mode]
 */
export function buildCuratorPersonaPromptRule(settings, mode = 'companion') {
  const s = normalizeCuratorPersonaSettings(settings)
  const toneLine = ISKRA_CURATOR_TONE_LABELS[s.tone] ?? ISKRA_CURATOR_TONE_LABELS.supportive

  const lines = [
    `Тон: ${toneLine}.`,
    `Глубина ответа: ${s.depth}.`,
  ]

  if (mode === 'habits' && s.habit_check_enabled) {
    lines.push('Привычки: один маленький шаг, без стыда за срыв; спроси что мешало.')
  }
  if (mode === 'health' && s.health_reminders_enabled) {
    lines.push('Здоровье: ритм сна/нагрузки/питания — не медицинский диагноз.')
  }
  if (mode === 'companion' || s.companion_mode_default) {
    lines.push('Собеседник: сначала услышать, потом один вопрос — не чеклист задач.')
  }
  if (mode === 'business' || mode === 'sales_kpi') {
    lines.push('Бизнес сети: продажи, KPI, план — из snapshot; стратегия и приоритеты владельца.')
  }
  if (s.morning_brief_enabled && mode === 'schedule') {
    lines.push('Утро/день: 3 приоритета и один якорь времени.')
  }

  return lines.join(' ')
}

/**
 * @param {IskraCuratorPersonaSettings | null | undefined} settings
 */
export function buildCuratorPersonaForContext(settings) {
  const s = normalizeCuratorPersonaSettings(settings)
  return {
    tone: s.tone,
    depth: s.depth,
    habit_check_enabled: s.habit_check_enabled,
    morning_brief_enabled: s.morning_brief_enabled,
    health_reminders_enabled: s.health_reminders_enabled,
    business_bridge_enabled: s.business_bridge_enabled,
  }
}
