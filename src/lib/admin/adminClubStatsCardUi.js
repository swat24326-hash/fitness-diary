/**
 * Текст подвала карточки статистики (без «открыть/скрыть» — панель только переключается).
 * @param {{
 *   open?: boolean,
 *   available?: boolean,
 *   busy?: boolean,
 *   emptyLabel?: string,
 *   idleHint?: string,
 * }} p
 */
export function adminClubStatCardFoot(p = {}) {
  if (p.busy) return 'считаем…'
  if (!p.available) return p.emptyLabel || 'нет данных'
  return p.idleHint || ''
}
