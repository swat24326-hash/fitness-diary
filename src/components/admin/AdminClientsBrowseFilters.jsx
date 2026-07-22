import { AlertTriangle, Clock, UserCheck, Users, UserX } from 'lucide-react'
import { AdminClientsFilterTile } from './AdminClientsFilterTile.jsx'
import '../../styles/admin-clients-filters.css'

/** Подсказки «что за фильтр» — по клику на ? */
export const ADMIN_CLIENTS_FILTER_HELP = {
  all: 'Все клиенты клуба без архива. Полный список для поиска и работы по карточкам.',
  inactive:
    'Нет действующего абонемента на сегодня: закончились тренировки, истёк срок или абонемент ещё не начался.',
  active_today: 'Есть абонемент, по которому сегодня можно провести тренировку.',
  expiring: 'Абонемент заканчивается в ближайшие 3 дня. Удобно для SMS клуба с шаблоном «продлим».',
  expired_remaining: 'Срок абонемента уже истёк, но тренировки по нему ещё остались.',
}

/**
 * Сводка на сегодня — пять одинаковых квадратных фильтров.
 * @param {{
 *   counts: { all: number, inactive: number, active_today: number, expiring: number, expired_remaining: number },
 *   quickFilter: string,
 *   onApply: (id: string) => void,
 * }} props
 */
export function AdminClientsBrowseFilters({ counts, quickFilter, onApply }) {
  const tile = (id, extra = {}) => ({
    active: quickFilter === id,
    hot: Boolean(extra.hot),
    warn: Boolean(extra.warn),
    onSelect: () => onApply(id),
    helpText: ADMIN_CLIENTS_FILTER_HELP[id],
  })

  return (
    <div className="admin-clients-workspace__metrics">
      <p className="admin-clients-workspace__metrics-title">Сводка на сегодня</p>
      <ul className="admin-clients-filters-grid" aria-label="Быстрый выбор списка">
        <AdminClientsFilterTile
          icon={<Users size={18} />}
          count={counts.all}
          label="Все клиенты"
          {...tile('all')}
        />
        <AdminClientsFilterTile
          icon={<UserX size={18} />}
          count={counts.inactive}
          label="Не активные"
          {...tile('inactive', { hot: counts.inactive > 0 })}
        />
        <AdminClientsFilterTile
          icon={<UserCheck size={18} />}
          count={counts.active_today}
          label="С абонементом"
          {...tile('active_today')}
        />
        <AdminClientsFilterTile
          icon={<Clock size={18} />}
          count={counts.expiring}
          label="≤ 3 дня"
          {...tile('expiring', { hot: counts.expiring > 0 })}
        />
        <AdminClientsFilterTile
          icon={<AlertTriangle size={18} />}
          count={counts.expired_remaining}
          label="Срок истёк"
          {...tile('expired_remaining', {
            hot: counts.expired_remaining > 0,
            warn: true,
          })}
        />
      </ul>
    </div>
  )
}
