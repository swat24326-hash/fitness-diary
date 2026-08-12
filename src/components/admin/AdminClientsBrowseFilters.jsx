import { AlertTriangle, Cake, CalendarClock, Clock, History, Sparkles, Users, UserX } from 'lucide-react'
import { AdminClientsFilterTile } from './AdminClientsFilterTile.jsx'
import { MEMBERSHIP_EXPIRING_WITHIN_DAYS } from '../../lib/clientListSignals.js'
import { BIRTHDAY_WINDOW_DAYS } from '../../lib/clientBirthdays.js'
import { STALE_TRAINING_DAYS, STALE_MAX_DAYS } from '../../lib/trainer/trainerClientOutreachCore.js'
import '../../styles/admin-clients-filters.css'

/** Подсказки «что за фильтр» — по клику на ? */
export const ADMIN_CLIENTS_FILTER_HELP = {
  all: 'Клиенты на этой вкладке (ПЗ / ТЗ / АЗ) без архива и без открытой воронки ПНК. Цифра = длина списка по клику. Не «все люди клуба» и не census Статистики.',
  pnk: 'Открытые карточки воронки ПНК (пробная / ещё не ДК). Как у тренера: отдельно от «всех» клиентов клуба.',
  inactive:
    `Финал воронки абона: больше ${STALE_MAX_DAYS} дней после конца — или странный/пустой абон (нет дат, нельзя отнести к этапу). Не пересекается с «Закончился» и «Давно не был». ПНК сюда не входят.`,
  awaiting_start:
    'Следующий абонемент уже куплен, старт ещё впереди. Не цель для SMS «вернись / купи» — клиент удержан.',
  birthdays: `ДР сегодня и ближайшие ${BIRTHDAY_WINDOW_DAYS} дней — цифра на плитке = длина списка по клику. SMS-поздравление — только у кого ДР сегодня.`,
  expiring: `Абонемент ещё действует и заканчивается в ближайшие ${MEMBERSHIP_EXPIRING_WITHIN_DAYS} дней. Предупреждаем до конца.`,
  expired_recent: `Абонемент уже не действует: с даты конца прошло меньше ${STALE_TRAINING_DAYS} дней — или тренировки исчерпаны, а календарный срок ещё идёт. Пора продлить. Открытые ПНК сюда не входят — только чип «ПНК».`,
  stale: `Абонемент закончился ${STALE_TRAINING_DAYS}–${STALE_MAX_DAYS} дней назад, нового со стартом впереди нет. Холодный возврат. Дальше — «Не активные».`,
}

/**
 * @param {{
 *   counts: {
 *     all: number,
 *     pnk: number,
 *     inactive: number,
 *     awaiting_start: number,
 *     birthdays: number,
 *     expiring: number,
 *     expired_recent: number,
 *     stale: number,
 *   },
 *   quickFilter: string,
 *   onApply: (id: string) => void,
 *   hidePnk?: boolean,
 * }} props
 */
export function AdminClientsBrowseFilters({ counts, quickFilter, onApply, hidePnk = false }) {
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

      <section className="admin-clients-filters-section" aria-labelledby="admin-clients-filters-base">
        <h3 id="admin-clients-filters-base" className="admin-clients-filters-section__title">
          База и поводы
        </h3>
        <ul
          className={`admin-clients-filters-grid admin-clients-filters-grid--base${
            hidePnk ? ' admin-clients-filters-grid--base-2' : ''
          }`}
          aria-label="База и поводы"
        >
          <AdminClientsFilterTile
            icon={<Users size={18} strokeWidth={2} />}
            count={counts.all}
            label="Все клиенты"
            {...tile('all')}
          />
          {!hidePnk ? (
            <AdminClientsFilterTile
              icon={<Sparkles size={18} strokeWidth={2} />}
              count={counts.pnk}
              label="ПНК"
              {...tile('pnk', { hot: counts.pnk > 0 })}
            />
          ) : null}
          <AdminClientsFilterTile
            icon={<Cake size={18} strokeWidth={2} />}
            count={counts.birthdays}
            label="ДР сегодня"
            {...tile('birthdays', { hot: counts.birthdays > 0 })}
          />
        </ul>
      </section>

      <section className="admin-clients-filters-section" aria-labelledby="admin-clients-filters-path">
        <h3 id="admin-clients-filters-path" className="admin-clients-filters-section__title">
          По абонементу
        </h3>
        <ul
          className="admin-clients-filters-grid admin-clients-filters-grid--path"
          aria-label="По абонементу: путь клиента"
        >
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
        </ul>
      </section>
    </div>
  )
}
