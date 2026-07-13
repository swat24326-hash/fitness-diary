/**
 * ИСКРА-Куратор: расширенная роль над сетью клубов.
 * База — продажи, KPI, аналитика (как у app_admin, мульти-клуб).
 * Дополнение — личный слой: привычки, здоровье, расписание, собеседник.
 * scripts/verify-iskra-curator-contour.mjs
 */

/** @typedef {'club_admin'|'network_curator'} IskraAdvisorScope */

/** @typedef {'business'|'sales_kpi'|'personal'|'habits'|'health'|'schedule'|'companion'} IskraCuratorMode */

export const ISKRA_CURATOR_MODES = /** @type {const} */ ([
  'business',
  'sales_kpi',
  'personal',
  'habits',
  'health',
  'schedule',
  'companion',
])

/** Режимы личного дополнения (не заменяют бизнес-контекст). */
export const ISKRA_CURATOR_PERSONAL_MODES = /** @type {const} */ ([
  'personal',
  'habits',
  'health',
  'schedule',
  'companion',
])

const CURATOR_MODE_HINTS = {
  business:
    'стратегия и приоритеты владельца сети — опирайся на продажи, план, KPI из snapshot; личный слой только если уместен',
  sales_kpi:
    'продажи, план, НК/ДК/УК, ПЗ/ТЗ/АЗ, прогноз, сравнение клубов — главный фокус куратора',
  personal: 'личные дела и быт — при необходимости свяжи с нагрузкой владельца, не теряя KPI',
  habits: 'привычки и рутины владельца — мягкая поддержка, без диагнозов; бизнес-контекст сохраняй',
  health: 'здоровье и ритм (сон, нагрузка) — не медкарта клиента клуба',
  schedule: 'расписание и фокус дня/недели владельца',
  companion: 'собеседник: слушать и уточнять; если всплывает клуб — KPI из snapshot, не выдумывай',
}

const MODE_INTENT_RE = [
  { mode: 'sales_kpi', re: /продаж|план|kpi|нк|дк|ук|пз|тз|аз|выручк|прогноз|аналитик|отчёт|отчет/i },
  { mode: 'habits', re: /привычк|рутин|мотивац|прокрастин|дисциплин/i },
  { mode: 'health', re: /здоров|сон|питан|вес|шаг|вода|отдых/i },
  { mode: 'schedule', re: /расписан|календар|план.*дн|недел|фокус.*дн|слот/i },
  { mode: 'companion', re: /поговор|обсуд|выговор|как ты|поддерж|тревог|стресс|психолог/i },
  { mode: 'personal', re: /личн|семь|дом|отношен|быт/i },
  { mode: 'business', re: /бизнес|стратег|приоритет|решени|собственник|сеть|клуб/i },
]

/**
 * @param {string} [advisorRoleId]
 * @returns {IskraAdvisorScope}
 */
export function resolveIskraAdvisorScope(advisorRoleId) {
  const id = String(advisorRoleId ?? '').trim()
  if (id === 'curator') return 'network_curator'
  return 'club_admin'
}

/**
 * @param {string} [advisorRoleId]
 */
export function isNetworkCuratorRole(advisorRoleId) {
  return resolveIskraAdvisorScope(advisorRoleId) === 'network_curator'
}

/**
 * @param {IskraCuratorMode} mode
 */
export function isCuratorPersonalExtensionMode(mode) {
  return ISKRA_CURATOR_PERSONAL_MODES.includes(/** @type {typeof ISKRA_CURATOR_PERSONAL_MODES[number]} */ (mode))
}

/**
 * @param {string} [userMessage]
 * @param {IskraCuratorMode | null | undefined} [explicitMode]
 */
export function resolveCuratorMode(userMessage, explicitMode = null) {
  const forced = String(explicitMode ?? '').trim()
  if (forced && ISKRA_CURATOR_MODES.includes(/** @type {IskraCuratorMode} */ (forced))) {
    return /** @type {IskraCuratorMode} */ (forced)
  }
  const text = String(userMessage ?? '')
  for (const row of MODE_INTENT_RE) {
    if (row.re.test(text)) return row.mode
  }
  return 'sales_kpi'
}

/**
 * @param {IskraCuratorMode} mode
 */
export function buildCuratorModeRule(mode) {
  const hint = CURATOR_MODE_HINTS[mode] ?? CURATOR_MODE_HINTS.sales_kpi
  const personal = isCuratorPersonalExtensionMode(mode)
  return [
    `РЕЖИМ КУРАТОРА: ${mode}.`,
    hint,
    personal
      ? 'Личный слой — дополнение; продажи и KPI из snapshot не отбрасывай, если вопрос касается бизнеса.'
      : 'Куратор сети: продажи, аналитика и KPI — в приоритете.',
  ].join(' ')
}

/**
 * Правило роли куратора для системного промпта.
 */
export function buildCuratorRoleRule() {
  return [
    'РОЛЬ: Куратор сети клубов.',
    'Основа: продажи, план, KPI, аналитика по клубам (отчёты менеджеров, сравнение филиалов).',
    'Расширение: привычки, здоровье, расписание, психологическая поддержка, собеседник — в том же диалоге.',
    'Не разделяй бизнес и личное жёстко: это один помощник с двумя слоями.',
    'Один клуб сейчас — готовься к мульти-клубному snapshot (network_clubs).',
  ].join('\n')
}

/**
 * Дополняет промпт-блок личным контекстом куратора (не убирает клубные данные).
 * @param {object | null | undefined} block
 * @param {{ curatorContext?: object | null, mode?: IskraCuratorMode, advisorRoleId?: string }} [opts]
 */
export function augmentPromptBlockForCurator(block, opts = {}) {
  if (!block || typeof block !== 'object') return block
  if (!isNetworkCuratorRole(opts.advisorRoleId)) return block

  const mode = opts.mode ?? 'sales_kpi'
  const curatorContext = opts.curatorContext ?? null

  return {
    ...block,
    advisor_scope: 'network_curator',
    curator_mode: mode,
    curator_extension_active: isCuratorPersonalExtensionMode(mode),
    curator_context: curatorContext ? buildCuratorContextBlock(curatorContext, mode) : null,
  }
}

/**
 * @deprecated Используйте augmentPromptBlockForCurator. Куратор не отрезает клубный snapshot.
 * @param {object | null | undefined} block
 * @param {IskraAdvisorScope} [_scope]
 */
export function filterPromptBlockForProductContour(block, _scope = 'club_admin') {
  return block
}

/**
 * @param {object | null | undefined} curatorContext
 * @param {IskraCuratorMode} mode
 */
export function buildCuratorContextBlock(curatorContext, mode) {
  const ctx = curatorContext && typeof curatorContext === 'object' ? curatorContext : {}
  return {
    source: 'curator_profile',
    mode,
    persona: ctx.persona ?? null,
    habits: Array.isArray(ctx.habits) ? ctx.habits.slice(0, 8) : [],
    schedule_today: ctx.schedule_today ?? null,
    health_focus: ctx.health_focus ?? null,
    notes: ctx.notes ?? null,
    instruction:
      'Личный слой дополняет бизнес-ответ. При вопросе о клубе — KPI из snapshot; при личном — curator_context.',
  }
}

/**
 * Куратор использует клубный/сетевой snapshot (продажи, KPI).
 * @param {string} [advisorRoleId]
 */
export function shouldUseClubGeminiSnapshot(advisorRoleId) {
  const scope = resolveIskraAdvisorScope(advisorRoleId)
  return scope === 'club_admin' || scope === 'network_curator'
}

/**
 * @param {object | null | undefined} snapshot
 */
export function buildNetworkClubsPlaceholder(snapshot) {
  const clubName = String(snapshot?.club_name ?? '').trim()
  if (!clubName) return null
  return {
    scope: 'single_club_until_multi',
    clubs: [{ club_id: snapshot?.club_id ?? null, club_name: clubName }],
    note: 'Мульти-клуб: агрегат network_clubs подключим при 2+ филиалах',
  }
}
