import { AlertTriangle, Cake, CalendarClock, Clock, Sparkles, Users } from 'lucide-react'
import { STALE_TRAINING_DAYS, STALE_MAX_DAYS } from '../../lib/trainer/trainerClientOutreachCore.js'
import '../../styles/trainer-clients.css'

export const TRAINER_CLIENTS_BROWSE_LABELS = {
  all: 'Все клиенты',
  pnk: 'ПНК',
  birthdays: 'ДР сегодня',
  expiring: 'Истекает абонемент',
  expired_recent: 'Абонемент закончился',
  stale: 'Давно не был',
}

/** Короткие title для чипов (длинный смысл — в title). */
const CHIP_HINT = {
  all: 'Все ваши активные клиенты',
  pnk: 'Воронка ПНК',
  birthdays: 'День рождения сегодня',
  expiring: 'Абонемент заканчивается ≤ 3 дней',
  expired_recent: `Закончился меньше ${STALE_TRAINING_DAYS} дней назад`,
  stale: `Давно не был: ${STALE_TRAINING_DAYS}–${STALE_MAX_DAYS} дней после конца`,
}

/**
 * Компактный чип для планшета (не админская плитка).
 * @param {{
 *   id: string,
 *   label: string,
 *   count: number,
 *   icon: import('react').ReactNode,
 *   active: boolean,
 *   hot?: boolean,
 *   warn?: boolean,
 *   onSelect: () => void,
 * }} props
 */
function TrainerFilterChip({ id, label, count, icon, active, hot = false, warn = false, onSelect }) {
  const className = [
    'trainer-clients-chip',
    active ? 'trainer-clients-chip--active' : '',
    !active && hot ? 'trainer-clients-chip--hot' : '',
    warn ? 'trainer-clients-chip--warn' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      aria-pressed={active}
      title={CHIP_HINT[id] ?? label}
      aria-label={`${label}: ${count}`}
    >
      <span className="trainer-clients-chip__icon" aria-hidden>
        {icon}
      </span>
      <span className="trainer-clients-chip__label">{label}</span>
      <span className="trainer-clients-chip__count">{count}</span>
    </button>
  )
}

/**
 * Фильтры тренера: компактные чипы (список клиентов сразу виден).
 * Крупная сводка «на сегодня» — на главной («Сегодня внимание»).
 *
 * @param {{
 *   counts: {
 *     all: number,
 *     pnk: number,
 *     birthdays: number,
 *     expiring: number,
 *     expired_recent: number,
 *     stale: number,
 *   },
 *   quickFilter: string,
 *   onApply: (id: string) => void,
 * }} props
 */
export function TrainerClientsBrowseFilters({ counts, quickFilter, onApply }) {
  const chip = (id, icon, label, extra = {}) => (
    <TrainerFilterChip
      key={id}
      id={id}
      icon={icon}
      label={label}
      count={counts[id] ?? 0}
      active={quickFilter === id}
      hot={Boolean(extra.hot)}
      warn={Boolean(extra.warn)}
      onSelect={() => onApply(id)}
    />
  )

  return (
    <div className="trainer-clients-filters" aria-label="Быстрые фильтры">
      <div className="trainer-clients-filters__row" role="group" aria-label="База и поводы">
        <span className="trainer-clients-filters__legend">Поводы</span>
        <div className="trainer-clients-filters__chips">
          {chip('all', <Users size={16} strokeWidth={2} />, 'Все')}
          {chip('pnk', <Sparkles size={16} strokeWidth={2} />, 'ПНК', { hot: counts.pnk > 0 })}
          {chip('birthdays', <Cake size={16} strokeWidth={2} />, 'ДР', { hot: counts.birthdays > 0 })}
        </div>
      </div>
      <div className="trainer-clients-filters__row" role="group" aria-label="По абонементу">
        <span className="trainer-clients-filters__legend">Абонемент</span>
        <div className="trainer-clients-filters__chips">
          {chip('expiring', <Clock size={16} strokeWidth={2} />, 'Истекает', { hot: counts.expiring > 0 })}
          {chip('expired_recent', <AlertTriangle size={16} strokeWidth={2} />, 'Закончился', {
            hot: counts.expired_recent > 0,
            warn: true,
          })}
          {chip('stale', <CalendarClock size={16} strokeWidth={2} />, 'Давно', { hot: counts.stale > 0 })}
        </div>
      </div>
    </div>
  )
}
