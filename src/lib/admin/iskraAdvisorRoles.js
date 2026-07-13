/**
 * Роли советника ИСКРЫ — не путать с public.users.role.
 *
 * Сейчас в проде активна только app_admin (пользователь admin).
 * club_supervisor — управляющий клуба (операционка).
 * curator — куратор сети: продажи/KPI по клубам + личное расширение (docs/ISKRA_CURATOR.md).
 */

/** @typedef {'app_admin'|'club_supervisor'|'curator'} IskraAdvisorRoleId */

/** Роли, для которых уже подключён UI/API (остальные — только реестр). */
export const ISKRA_ACTIVE_ADVISOR_ROLE_IDS = /** @type {const} */ (['app_admin'])

/**
 * @typedef {{
 *   id: IskraAdvisorRoleId,
 *   labelRu: string,
 *   description: string,
 *   active: boolean,
 *   capabilities: string[],
 *   hiddenTopicIds: string[],
 *   defaultChipIds: string[],
 *   personaFocus: string,
 *   analysisFocus: 'sales'|'trainer'|'app',
 * }} IskraAdvisorRoleDef
 */

/** Полный набор быстрых кнопок бизнес-аналитики (как у куратора). */
const FULL_BUSINESS_CHIP_IDS = [
  'intro',
  'advice',
  'plan',
  'gap',
  'month_forecast',
  'compare',
  'sales_structure',
  'finance',
]

/** @type {Record<IskraAdvisorRoleId, IskraAdvisorRoleDef>} */
export const ISKRA_ADVISOR_ROLES = {
  app_admin: {
    id: 'app_admin',
    labelRu: 'Админ',
    description:
      'Максимальный доступ: полная аналитика клуба, бизнес-советы, техподдержка приложения и организация',
    active: true,
    capabilities: [
      'plan',
      'forecast',
      'finance',
      'sales_structure',
      'trainers',
      'advice',
      'strategy',
      'risks',
      'app_guide',
      'diagnostics',
      'organization',
      'full_data_read',
    ],
    hiddenTopicIds: [],
    defaultChipIds: [...FULL_BUSINESS_CHIP_IDS, 'app_guide', 'app_sync'],
    personaFocus:
      'Советуй как главный штаб FIT-CITY: полная аналитика клуба, бизнес-шаги, техподдержка приложения (sync, клиенты, организация, деплой) — по теме вопроса.',
    analysisFocus: 'sales',
  },
  club_supervisor: {
    id: 'club_supervisor',
    labelRu: 'Управляющий',
    description: 'План, тренировки, тренеры — плюс подсказки по работе в приложении (включим позже)',
    active: false,
    capabilities: ['plan', 'trainers', 'trainings', 'advice_lite', 'app_guide', 'risks_lite'],
    hiddenTopicIds: [
      'net_profit',
      'payroll_margin',
      'supervisor_expense',
      'club_finance_net',
      'sales_refunds_detail',
    ],
    defaultChipIds: ['intro', 'advice', 'plan', 'gap', 'trainer_summary', 'app_guide', 'fitcity'],
    personaFocus:
      'Советуй как наставник управляющего: план, тренировки, тренеры — коротко. Подскажи работу в приложении.',
    analysisFocus: 'sales',
  },
  curator: {
    id: 'curator',
    labelRu: 'Куратор',
    description:
      'Куратор сети: продажи, KPI и аналитика по клубам — плюс личный слой (привычки, здоровье, собеседник)',
    active: false,
    capabilities: [
      'plan',
      'forecast',
      'finance',
      'sales_structure',
      'trainers',
      'advice',
      'strategy',
      'risks',
      'multi_club',
      'network_kpi',
      'curator_personal',
      'curator_habits',
      'curator_health',
      'curator_schedule',
      'curator_companion',
    ],
    hiddenTopicIds: [],
    defaultChipIds: [
      ...FULL_BUSINESS_CHIP_IDS,
      'sales_directions',
      'curator_habits',
      'curator_health',
      'curator_talk',
    ],
    personaFocus:
      'Куратор сети клубов: в первую очередь продажи, план, KPI и аналитика; личные привычки, здоровье и диалог — расширение того же помощника.',
    analysisFocus: 'sales',
  },
}

export const ISKRA_ADVISOR_ROLE_IDS = Object.keys(ISKRA_ADVISOR_ROLES)

/** @param {string} [id] */
export function isIskraAdvisorRoleActive(id) {
  return ISKRA_ACTIVE_ADVISOR_ROLE_IDS.includes(String(id ?? '').trim())
}

/** @param {string} [id] @returns {IskraAdvisorRoleDef} */
export function resolveIskraAdvisorRole(id) {
  const key = String(id ?? '').trim()
  if (key === 'club_manager') return ISKRA_ADVISOR_ROLES.club_supervisor
  if (key && ISKRA_ADVISOR_ROLES[/** @type {IskraAdvisorRoleId} */ (key)]) {
    return ISKRA_ADVISOR_ROLES[/** @type {IskraAdvisorRoleId} */ (key)]
  }
  return ISKRA_ADVISOR_ROLES.app_admin
}

/** @param {IskraAdvisorRoleDef} role @param {string} capability */
export function iskraAdvisorHasCapability(role, capability) {
  return (role?.capabilities ?? []).includes(String(capability ?? '').trim())
}

/** Полный доступ к snapshot (продажи, финансы, тренеры). Куратор — по сети клубов. */
export function iskraAdvisorFullAccess(roleOrId) {
  const role =
    typeof roleOrId === 'object' && roleOrId?.id
      ? roleOrId
      : resolveIskraAdvisorRole(String(roleOrId ?? ''))
  return role.id === 'app_admin' || role.id === 'curator'
}

/** Куратор сети (мульти-клуб + личное расширение). */
export function iskraAdvisorNetworkCurator(roleOrId) {
  const role =
    typeof roleOrId === 'object' && roleOrId?.id
      ? roleOrId
      : resolveIskraAdvisorRole(String(roleOrId ?? ''))
  return role.id === 'curator'
}

/** @deprecated Используйте iskraAdvisorNetworkCurator */
export function iskraAdvisorCuratorContour(roleOrId) {
  return iskraAdvisorNetworkCurator(roleOrId)
}
