/**
 * Тексты и правила подтверждения удаления абонемента (без React/IDB).
 */

import { formatDateRu } from './dateRu.js'

/**
 * @param {{
 *   membership?: { start_date?: string, end_date?: string, used_trainings?: number, total_trainings?: number } | null,
 *   linkedTrainingsCount?: number,
 * }} input
 * @returns {{ title: string, body: string, periodLabel: string, hasLinkedTrainings: boolean, usedLabel: string }}
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

  const hasLinkedTrainings = linked > 0 || (Number.isFinite(used) && used > 0)

  let body =
    'Абонемент будет удалён с устройства и уйдёт в облако при Sync. Действие нельзя отменить.'
  if (hasLinkedTrainings) {
    const n = linked > 0 ? linked : used
    body +=
      linked > 0
        ? ` В дневнике останется ${n} связанн${n === 1 ? 'ая тренировка' : n >= 2 && n <= 4 ? 'ые тренировки' : 'ых тренировок'} — они не удалятся, но история этого абонемента пропадёт.`
        : ` По абонементу уже есть списания (${usedLabel}) — записи в дневнике останутся, история этого абонемента пропадёт.`
  } else {
    body += ' Если создали по ошибке и ещё не списывали тренировки — это безопасный способ убрать лишнюю запись.'
  }

  return {
    title: 'Удалить абонемент?',
    body,
    periodLabel,
    hasLinkedTrainings,
    usedLabel,
  }
}
