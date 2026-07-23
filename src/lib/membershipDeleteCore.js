/**
 * Тексты и правила удаления абонемента (без React/IDB).
 * С связанными тренировками / списаниями — сначала убрать их, потом абонемент.
 */

import { formatDateRu } from './dateRu.js'

/**
 * @param {{
 *   membership?: { start_date?: string, end_date?: string, used_trainings?: number, total_trainings?: number } | null,
 *   linkedTrainingsCount?: number,
 * }} input
 * @returns {boolean}
 */
export function membershipDeleteBlockedByTrainings(input = {}) {
  const linked = Math.max(0, Number(input.linkedTrainingsCount) || 0)
  if (linked > 0) return true
  const used = Number(input.membership?.used_trainings ?? 0)
  return Number.isFinite(used) && used > 0
}

/**
 * @param {{
 *   membership?: { start_date?: string, end_date?: string, used_trainings?: number, total_trainings?: number } | null,
 *   linkedTrainingsCount?: number,
 * }} input
 * @returns {{
 *   title: string,
 *   body: string,
 *   periodLabel: string,
 *   hasLinkedTrainings: boolean,
 *   blocked: boolean,
 *   usedLabel: string,
 *   linkedCount: number,
 *   confirmLabel: string,
 * }}
 */
export function buildMembershipDeleteConfirmCopy(input = {}) {
  const m = input.membership ?? null
  const linked = Math.max(0, Number(input.linkedTrainingsCount) || 0)
  const used = Number(m?.used_trainings ?? 0)
  const total = Number(m?.total_trainings ?? 0)
  const startRu = m?.start_date ? formatDateRu(m.start_date) : '—'
  const endRu = m?.end_date ? formatDateRu(m.end_date) : '—'
  const periodLabel = `${startRu} — ${endRu}`
  const usedLabel =
    Number.isFinite(total) && total > 0
      ? `${Number.isFinite(used) ? used : 0}/${total}`
      : String(Number.isFinite(used) ? used : 0)

  const blocked = membershipDeleteBlockedByTrainings(input)
  const linkedCount = linked > 0 ? linked : Number.isFinite(used) && used > 0 ? used : 0

  if (blocked) {
    const n = linkedCount
    const trainingsWord =
      n === 1 ? 'тренировку' : n >= 2 && n <= 4 ? 'тренировки' : 'тренировок'
    return {
      title: 'Сначала удалите тренировки',
      body:
        linked > 0
          ? `У этого абонемента есть ${n} ${trainingsWord} в дневнике. Откройте список тренировок абонемента, удалите их (или отмените списания), затем снова удалите абонемент.`
          : `По абонементу уже есть списания (${usedLabel}). Откройте список тренировок абонемента, удалите связанные записи, затем снова удалите абонемент.`,
      periodLabel,
      hasLinkedTrainings: true,
      blocked: true,
      usedLabel,
      linkedCount,
      confirmLabel: 'К тренировкам',
    }
  }

  return {
    title: 'Удалить абонемент?',
    body:
      'Абонемент будет удалён с устройства и уйдёт в облако при Sync. Действие нельзя отменить. Если создали по ошибке и ещё не списывали тренировки — это безопасный способ убрать лишнюю запись.',
    periodLabel,
    hasLinkedTrainings: false,
    blocked: false,
    usedLabel,
    linkedCount: 0,
    confirmLabel: 'Удалить',
  }
}
