import { AlertTriangle, Cake, CalendarClock, Clock, History, Users, UserX } from 'lucide-react'
import { AdminClientsFilterTile } from './AdminClientsFilterTile.jsx'
import { STALE_TRAINING_DAYS } from '../../lib/trainer/trainerClientOutreachCore.js'
import '../../styles/admin-clients-filters.css'

/** Подсказки «что за фильтр» — по клику на ? */
export const ADMIN_CLIENTS_FILTER_HELP = {
  all: 'Все клиенты клуба без архива. Полный список для поиска и работы по карточкам.',
  inactive:
    'Нет действующего абонемента на сегодня и нет купленного со стартом впереди. Цель учёта и возврата.',
  awaiting_start:
    'Следующий абонемент уже куплен, старт ещё впереди. Не цель для SMS «вернись / купи» — клиент удержан.',
  birthdays: 'День рождения сегодня. Отдельный срез для поздравления (SMS от клуба).',
  expiring: 'Абонемент ещё действует и заканчивается в ближайшие 3 дня. Предупреждаем до конца.',
  expired_recent: `Абонемент уже не действует; с даты конца прошло меньше ${STALE_TRAINING_DAYS} дней. Пора продлить.`,
  stale: `Абонемент закончился ${STALE_TRAINING_DAYS}+ дней назад, нового со стартом впереди нет. Холодный возврат.`,
}

/**
 * @param {{
 *   counts: {
 *     all: number,
 *     inactive: number,
 *     awaiting_start: number,
 *     birthdays: number,
 *     expiring: number,
 *     expired_recent: number,
 *     stale: number,
 *   },
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
          icon={<Users size={18} strokeWidth={2} />}
          count={counts.all}
          label="Все клиенты"
          {...tile('all')}
        />
        <AdminClientsFilterTile
          icon={<UserX size={18} strokeWidth={2} />}
          count={counts.inactive}
          label="Не активные"
          {...tile('inactive', { hot: counts.inactive > 0 })}
        />
        <AdminClientsFilterTile
          icon={<CalendarClock size={18} strokeWidth={2} />}
          count={counts.awaiting_start}
          label="Ждёт старт"
          {...tile('awaiting_start')}
        />
        <AdminClientsFilterTile
          icon={<Cake size={18} strokeWidth={2} />}
          count={counts.birthdays}
          label="ДР сегодня"
          {...tile('birthdays', { hot: counts.birthdays > 0 })}
        />
        <AdminClientsFilterTile
          icon={<Clock size={18} strokeWidth={2} />}
          count={counts.expiring}
          label="Истекает"
          {...tile('expiring', { hot: counts.expiring > 0 })}
        />
        <AdminClientsFilterTile
          icon={<AlertTriangle size={18} strokeWidth={2} />}
          count={counts.expired_recent}
          label="Закончился"
          {...tile('expired_recent', { hot: counts.expired_recent > 0, warn: true })}
        />
        <AdminClientsFilterTile
          icon={<History size={18} strokeWidth={2} />}
          count={counts.stale}
          label="Давно не был"
          {...tile('stale', { hot: counts.stale > 0 })}
        />
      </ul>
    </div>
  )
}
