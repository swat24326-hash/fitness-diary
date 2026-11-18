/**
 * Тексты предупреждения: старый абон истёк, но занятия ещё висят — перед ранней активацией нового.
 */
import { formatDateRu } from '../dateRu.js'

/**
 * @param {{ remaining?: number, endDate?: string } | null | undefined} warn
 * @returns {string}
 */
export function formatEarlyActivateExpiredRemainingWarn(warn) {
  const remaining = Number(warn?.remaining ?? 0)
  const endRu = warn?.endDate ? formatDateRu(warn.endDate) : ''
  if (!(remaining > 0)) return ''
  if (endRu) {
    return `В предыдущем абонементе ещё ${remaining} заняти${remaining === 1 ? 'е' : remaining < 5 ? 'я' : 'й'} (срок до ${endRu} уже вышел). Если нужно списать их — сначала продлите дату старого абонемента в карточке. Иначе эта тренировка пойдёт с нового.`
  }
  return `В предыдущем абонементе ещё ${remaining} заняти${remaining === 1 ? 'е' : remaining < 5 ? 'я' : 'й'}, срок уже вышел. Сначала продлите дату старого в карточке — или включите новый осознанно.`
}
