import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Play } from 'lucide-react'
import {
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_FOCUS_HOUR,
  SCHEDULE_DAY_START_HOUR,
  assignScheduleEntryLanes,
  buildScheduleEntryLabel,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
  formatScheduleTimeRange,
  formatScheduleViewRangeLabel,
  weekdayShortRu,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import { formatDateRu, todayInTimeZoneIso } from '../../lib/dateRu.js'

const PX_PER_MIN = 1.4
const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60
const DAY_END_MIN = SCHEDULE_DAY_END_HOUR * 60
const TRACK_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN
const FOCUS_SCROLL_TOP = Math.max(0, (SCHEDULE_DAY_FOCUS_HOUR * 60 - DAY_START_MIN) * PX_PER_MIN - 8)
const COL_MIN_PX = 96

const ENTRY_MIN_HEIGHT_WITH_TRAINER = 78
const ENTRY_MIN_HEIGHT = 48
const ENTRY_MIN_HEIGHT_COMPACT = 36

/**
 * @param {{
 *   dayIsos: string[],
 *   anchorDayIso?: string,
 *   entries: object[],
 *   clientNameById?: Record<string, string>,
 *   trainerNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   readOnly?: boolean,
 *   showTrainerName?: boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onOpenDay?: (dayIso: string) => void,
 *   onAddAt: (dayIso: string, minutes: number) => void,
 *   onOpenEntry: (entry: object) => void,
 * }} props
 */
export function TrainerScheduleMultiDayAgenda({
  dayIsos,
  anchorDayIso = '',
  entries,
  clientNameById = {},
  trainerNameById = {},
  trainingById = {},
  readOnly = false,
  showTrainerName = false,
  onPrev,
  onNext,
  onOpenDay,
  onAddAt,
  onOpenEntry,
}) {
  const nav = useNavigate()
  const boardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const days = (dayIsos ?? []).map((d) => String(d).slice(0, 10)).filter(Boolean)
  const compact = days.length > 1
  const today = todayInTimeZoneIso()
  const anchor = String(anchorDayIso ?? '').slice(0, 10)
  const addDefaultDay =
    (anchor && days.includes(anchor) && anchor) ||
    (days.includes(today) && today) ||
    days[0] ||
    ''
  const hours = []
  for (let h = SCHEDULE_DAY_START_HOUR; h < SCHEDULE_DAY_END_HOUR; h++) hours.push(h)
  const title = formatScheduleViewRangeLabel(days, formatDateRu)
  const rangeKey = days.join('|')
  const multiGrid = {
    gridTemplateColumns: `52px repeat(${days.length}, minmax(${COL_MIN_PX}px, 1fr))`,
    minWidth: `calc(52px + ${days.length} * ${COL_MIN_PX + 8}px)`,
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    el.scrollTop = FOCUS_SCROLL_TOP
  }, [rangeKey])

  const renderDayTrack = (dayIso) => {
    const dayEntries = filterScheduleEntriesForDay(entries, dayIso)
    const entryLanes = assignScheduleEntryLanes(dayEntries)
    return (
      <div key={dayIso} className="trainer-schedule-day__track" style={{ height: TRACK_HEIGHT }}>
        {hours.map((h) =>
          readOnly ? (
            <div
              key={`slot-${dayIso}-${h}`}
              className="trainer-schedule-day__hour-slot trainer-schedule-day__hour-slot--readonly"
              style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
            />
          ) : (
            <button
              key={`slot-${dayIso}-${h}`}
              type="button"
              className="trainer-schedule-day__hour-slot"
              style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
              onClick={() => onAddAt(dayIso, h * 60)}
              aria-label={`Добавить запись ${formatDateRu(dayIso)} в ${formatScheduleMinutes(h * 60)}`}
            />
          ),
        )}
        {dayEntries.map((entry) => {
          const top = (Number(entry.start_minutes) - DAY_START_MIN) * PX_PER_MIN
          const minH = compact
            ? ENTRY_MIN_HEIGHT_COMPACT
            : showTrainerName
              ? ENTRY_MIN_HEIGHT_WITH_TRAINER
              : ENTRY_MIN_HEIGHT
          const height = Math.max(minH, (Number(entry.duration_minutes) || 60) * PX_PER_MIN - 4)
          const lane = entryLanes.get(String(entry.id)) ?? { lane: 0, laneCount: 1 }
          const laneCount = Math.max(1, Number(lane.laneCount) || 1)
          const laneIndex = Math.min(Math.max(0, Number(lane.lane) || 0), laneCount - 1)
          const widthPct = 100 / laneCount
          const leftPct = laneIndex * widthPct
          const label = buildScheduleEntryLabel(entry, clientNameById)
          const trainerName =
            showTrainerName && entry.trainer_id
              ? trainerNameById[String(entry.trainer_id)] ?? 'Тренер'
              : ''
          const hasClients = (entry.client_ids ?? []).length > 0
          const linkedTraining = entry.linked_training_id ? trainingById[entry.linked_training_id] : null
          const trainingChip = scheduleEntryTrainingStatusLabel(entry, linkedTraining)
          const start = resolveScheduleTrainingStart(entry, {
            trainingById,
            workoutsBase: '/trainer/workouts',
          })
          const titleParts = [formatScheduleTimeRange(entry), trainerName, label].filter(Boolean)
          return (
            <div
              key={entry.id}
              className={[
                'trainer-schedule-day__entry-wrap',
                hasClients ? 'trainer-schedule-day__entry-wrap--clients' : 'trainer-schedule-day__entry-wrap--note',
                laneCount > 1 ? 'trainer-schedule-day__entry-wrap--lane' : '',
                compact ? 'trainer-schedule-day__entry-wrap--compact' : '',
              ].join(' ')}
              style={{
                top,
                height,
                left: `${leftPct}%`,
                width: `calc(${widthPct}% - ${compact ? 2 : 4}px)`,
                right: 'auto',
              }}
            >
              <button
                type="button"
                className={[
                  'trainer-schedule-day__entry',
                  hasClients ? 'trainer-schedule-day__entry--clients' : 'trainer-schedule-day__entry--note',
                  trainerName ? 'trainer-schedule-day__entry--with-trainer' : '',
                  compact ? 'trainer-schedule-day__entry--compact' : '',
                ].join(' ')}
                onClick={() => onOpenEntry(entry)}
                title={titleParts.join(' · ')}
                aria-label={titleParts.join(', ')}
              >
                {compact ? (
                  <>
                    <span className="trainer-schedule-day__entry-time">
                      {formatScheduleMinutes(Number(entry.start_minutes) || 0)}
                    </span>
                    <span className="trainer-schedule-day__entry-label">{label}</span>
                  </>
                ) : (
                  <>
                    {trainerName ? (
                      <span className="trainer-schedule-day__entry-meta">
                        <span className="trainer-schedule-day__entry-time">{formatScheduleTimeRange(entry)}</span>
                        <span className="trainer-schedule-day__entry-trainer">{trainerName}</span>
                      </span>
                    ) : (
                      <span className="trainer-schedule-day__entry-time">{formatScheduleTimeRange(entry)}</span>
                    )}
                    <span className="trainer-schedule-day__entry-label">{label}</span>
                    {trainingChip ? <span className="trainer-schedule-day__entry-chip">{trainingChip}</span> : null}
                  </>
                )}
              </button>
              {!readOnly &&
              !compact &&
              (start.kind === 'open' || start.kind === 'new' || start.kind === 'pick_client') ? (
                <button
                  type="button"
                  className="btn btn-icon-square btn-primary trainer-schedule-day__entry-start"
                  title={start.label}
                  aria-label={start.label}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    if (start.kind === 'pick_client') onOpenEntry(entry)
                    else nav(start.path)
                  }}
                >
                  <Play size={16} aria-hidden />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  const hoursCol = (
    <div className="trainer-schedule-day__hours" aria-hidden>
      {hours.map((h) => (
        <div key={h} className="trainer-schedule-day__hour-label" style={{ height: 60 * PX_PER_MIN }}>
          {formatScheduleMinutes(h * 60)}
        </div>
      ))}
    </div>
  )

  return (
    <section
      className={[
        'trainer-schedule-day card',
        compact ? 'trainer-schedule-day--multi' : '',
        days.length >= 7 ? 'trainer-schedule-day--week' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Расписание: ${title}`}
    >
      <div className="trainer-schedule-day__head">
        <div className="trainer-schedule-day__nav">
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onPrev} aria-label="Назад">
            <ChevronLeft size={20} aria-hidden />
          </button>
          <h2 className="trainer-schedule-day__title">{title}</h2>
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onNext} aria-label="Вперёд">
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
        {!readOnly && addDefaultDay ? (
          <button
            type="button"
            className="btn btn-primary btn-sm trainer-schedule-day__add"
            onClick={() => onAddAt(addDefaultDay, 10 * 60)}
            aria-label="Новая запись"
          >
            <Plus size={18} aria-hidden />
            Запись
          </button>
        ) : readOnly ? (
          <span className="trainer-schedule-day__readonly-badge muted">Только просмотр</span>
        ) : null}
      </div>

      {compact ? (
        <div className="trainer-schedule-day__scroll">
          <div className="trainer-schedule-day__col-heads" style={multiGrid}>
            <span className="trainer-schedule-day__col-heads-spacer" aria-hidden />
            {days.map((dayIso) => {
              const isToday = dayIso === today
              const headLabel = `${weekdayShortRu(dayIso)} ${formatDateRu(dayIso).slice(0, 5)}`
              const className = [
                'trainer-schedule-day__col-head',
                !onOpenDay ? 'trainer-schedule-day__col-head--static' : '',
                isToday ? 'trainer-schedule-day__col-head--today' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return onOpenDay ? (
                <button
                  key={dayIso}
                  type="button"
                  className={className}
                  onClick={() => onOpenDay(dayIso)}
                  aria-label={`Открыть день ${formatDateRu(dayIso)}`}
                >
                  {headLabel}
                </button>
              ) : (
                <span key={dayIso} className={className}>
                  {headLabel}
                </span>
              )
            })}
          </div>
          <div className="trainer-schedule-day__board trainer-schedule-day__board--multi" ref={boardRef} style={multiGrid}>
            {hoursCol}
            {days.map((dayIso) => renderDayTrack(dayIso))}
          </div>
        </div>
      ) : (
        <div className="trainer-schedule-day__board" ref={boardRef}>
          {hoursCol}
          {days.map((dayIso) => renderDayTrack(dayIso))}
        </div>
      )}

      {days.every((d) => filterScheduleEntriesForDay(entries, d).length === 0) ? (
        <p className="trainer-schedule-day__empty muted">
          {readOnly
            ? 'На этот период записей нет.'
            : 'Нажмите на час или «Запись», чтобы добавить пометку или клиента.'}
        </p>
      ) : null}
    </section>
  )
}
