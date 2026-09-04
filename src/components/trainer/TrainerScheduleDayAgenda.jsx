import { useNavigate } from 'react-router-dom'
import { Plus, Play } from 'lucide-react'
import {
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_START_HOUR,
  assignScheduleEntryLanes,
  buildScheduleEntryLabel,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
  formatScheduleTimeRange,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import { formatDateRu } from '../../lib/dateRu.js'

const PX_PER_MIN = 1.4
const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60
const DAY_END_MIN = SCHEDULE_DAY_END_HOUR * 60
const TRACK_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN

/** Мин. высота карточки: время + тренер + ФИО клиента (админский вид). */
const ENTRY_MIN_HEIGHT_WITH_TRAINER = 78
const ENTRY_MIN_HEIGHT = 48

/**
 * @param {{
 *   dayIso: string,
 *   entries: object[],
 *   clientNameById?: Record<string, string>,
 *   trainerNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   readOnly?: boolean,
 *   showTrainerName?: boolean,
 *   onBack: () => void,
 *   onAddAtMinutes: (minutes: number) => void,
 *   onOpenEntry: (entry: object) => void,
 * }} props
 */
export function TrainerScheduleDayAgenda({
  dayIso,
  entries,
  clientNameById = {},
  trainerNameById = {},
  trainingById = {},
  readOnly = false,
  showTrainerName = false,
  onBack,
  onAddAtMinutes,
  onOpenEntry,
}) {
  const nav = useNavigate()
  const dayEntries = filterScheduleEntriesForDay(entries, dayIso)
  const entryLanes = assignScheduleEntryLanes(dayEntries)
  const hours = []
  for (let h = SCHEDULE_DAY_START_HOUR; h < SCHEDULE_DAY_END_HOUR; h++) hours.push(h)

  return (
    <section className="trainer-schedule-day card" aria-label={`Расписание на ${formatDateRu(dayIso)}`}>
      <div className="trainer-schedule-day__head">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          Месяц
        </button>
        <h2 className="trainer-schedule-day__title">{formatDateRu(dayIso)}</h2>
        {readOnly ? (
          <span className="trainer-schedule-day__readonly-badge muted">Только просмотр</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm trainer-schedule-day__add"
            onClick={() => onAddAtMinutes(10 * 60)}
            aria-label="Новая запись"
          >
            <Plus size={18} aria-hidden />
            Запись
          </button>
        )}
      </div>

      <div className="trainer-schedule-day__board">
        <div className="trainer-schedule-day__hours" aria-hidden>
          {hours.map((h) => (
            <div key={h} className="trainer-schedule-day__hour-label" style={{ height: 60 * PX_PER_MIN }}>
              {formatScheduleMinutes(h * 60)}
            </div>
          ))}
        </div>
        <div className="trainer-schedule-day__track" style={{ height: TRACK_HEIGHT }}>
          {hours.map((h) =>
            readOnly ? (
              <div
                key={`slot-${h}`}
                className="trainer-schedule-day__hour-slot trainer-schedule-day__hour-slot--readonly"
                style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
              />
            ) : (
              <button
                key={`slot-${h}`}
                type="button"
                className="trainer-schedule-day__hour-slot"
                style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
                onClick={() => onAddAtMinutes(h * 60)}
                aria-label={`Добавить запись в ${formatScheduleMinutes(h * 60)}`}
              />
            ),
          )}
          {dayEntries.map((entry) => {
            const top = (Number(entry.start_minutes) - DAY_START_MIN) * PX_PER_MIN
            const minH = showTrainerName ? ENTRY_MIN_HEIGHT_WITH_TRAINER : ENTRY_MIN_HEIGHT
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
            const start = resolveScheduleTrainingStart(entry, { trainingById, workoutsBase: '/trainer/workouts' })
            const titleParts = [formatScheduleTimeRange(entry), trainerName, label].filter(Boolean)
            return (
              <div
                key={entry.id}
                className={[
                  'trainer-schedule-day__entry-wrap',
                  hasClients ? 'trainer-schedule-day__entry-wrap--clients' : 'trainer-schedule-day__entry-wrap--note',
                  laneCount > 1 ? 'trainer-schedule-day__entry-wrap--lane' : '',
                ].join(' ')}
                style={{
                  top,
                  height,
                  left: `${leftPct}%`,
                  width: `calc(${widthPct}% - 4px)`,
                  right: 'auto',
                }}
              >
                <button
                  type="button"
                  className={[
                    'trainer-schedule-day__entry',
                    hasClients ? 'trainer-schedule-day__entry--clients' : 'trainer-schedule-day__entry--note',
                    trainerName ? 'trainer-schedule-day__entry--with-trainer' : '',
                  ].join(' ')}
                  onClick={() => onOpenEntry(entry)}
                  title={titleParts.join(' · ')}
                  aria-label={titleParts.join(', ')}
                >
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
                </button>
                {!readOnly && (start.kind === 'open' || start.kind === 'new' || start.kind === 'pick_client') ? (
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
      </div>
      {dayEntries.length === 0 ? (
        <p className="trainer-schedule-day__empty muted">
          {readOnly ? 'На этот день записей нет.' : 'Нажмите на час или «Запись», чтобы добавить пометку или клиента.'}
        </p>
      ) : null}
    </section>
  )
}
