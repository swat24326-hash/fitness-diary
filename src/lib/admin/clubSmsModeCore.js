import {
  isOutreachScenario,
  OUTREACH_SCENARIO_LABELS,
} from '../trainer/trainerClientOutreachCore.js'

/**
 * Режим клубного SMS по быстрому фильтру списка клиентов админки.
 * Шаблон outreach — только если фильтр = сценарий (сейчас в админке: expiring).
 * Иначе — свой текст (не подставлять expiring «вслепую»).
 *
 * @param {string | null | undefined} quickFilter
 * @returns {{ mode: 'template', scenario: string, label: string } | { mode: 'custom', scenario: null, label: string }}
 */
export function resolveClubSmsMode(quickFilter) {
  const filter = String(quickFilter ?? '').trim()
  if (isOutreachScenario(filter)) {
    return {
      mode: 'template',
      scenario: filter,
      label: OUTREACH_SCENARIO_LABELS[filter] || filter,
    }
  }
  return {
    mode: 'custom',
    scenario: null,
    label: 'Свой текст',
  }
}
