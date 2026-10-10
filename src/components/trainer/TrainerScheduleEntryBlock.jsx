import { useNavigate } from 'react-router-dom'
import { Check, Play } from 'lucide-react'
import {
  buildScheduleEntryLabel,
  formatScheduleMinutes,
  formatScheduleTimeRange,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import {
  resolveScheduleEntryKind,
  resolveScheduleEntryState,
  scheduleKindLabel,
} from '../../lib/trainer/trainerScheduleKindCore.js'

/**
 * Одна запись в колонке дня.
 * @param {{
 *   entry: object,
 *   style: object,
 *   compact: boolean,
 *   laneCount: number,
 *   trainerName?: string,
 *   clientNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   now: { todayIso: string, nowMinutes: number },
 *   readOnly?: boolean,
 *   variant?: 'normal' | 'drag-source' | 'ghost',
 *   dragHandlers?: object,
 *   onOpen?: () => void,
 * }} props
 */
export function TrainerScheduleEntryBlock({
  entry,
  style,
  compact,
  laneCount,
  trainerName = '',
  clientNameById = {},
  trainingById = {},
  now,
  readOnly = false,
  variant = 'normal',
  dragHandlers = {},
  onOpen,
}) {
  const nav = useNavigate()
  const ghost = variant === 'ghost'
  const label = buildScheduleEntryLabel(entry, clientNameById)
  const hasClients = (entry.client_ids ?? []).length > 0
  const linkedTraining = entry.linked_training_id ? trainingById[entry.linked_training_id] : null
  const trainingChip = scheduleEntryTrainingStatusLabel(entry, linkedTraining)
  const start = resolveScheduleTrainingStart(entry, { trainingById, workoutsBase: '/trainer/workouts' })
  const kind = resolveScheduleEntryKind(entry)
  const state = resolveScheduleEntryState(entry, linkedTraining, now)
  const titleParts = [formatScheduleTimeRange(entry), scheduleKindLabel(kind), trainerName, label].filter(Boolean)
  const doneMark = state.done ? (
    <span className="trainer-schedule-day__entry-done" aria-hidden>
      <Check size={12} strokeWidth={3} />
    </span>
  ) : null
  const showStart =
    !readOnly && !compact && !ghost && (start.kind === 'open' || start.kind === 'new' || start.kind === 'pick_client')

  const body = compact ? (
    <>
      <span className="trainer-schedule-day__entry-time">
        {doneMark}
        {formatScheduleMinutes(Number(entry.start_minutes) || 0)}
      </span>
      <span className="trainer-schedule-day__entry-label">{label}</span>
    </>
  ) : (
    <>
      {trainerName ? (
        <span className="trainer-schedule-day__entry-meta">
          <span className="trainer-schedule-day__entry-time">
            {doneMark}
            {formatScheduleTimeRange(entry)}
          </span>
          <span className="trainer-schedule-day__entry-trainer">{trainerName}</span>
        </span>
      ) : (
        <span className="trainer-schedule-day__entry-time">
          {doneMark}
          {formatScheduleTimeRange(entry)}
        </span>
      )}
      <span className="trainer-schedule-day__entry-label">{label}</span>
      {trainingChip ? <span className="trainer-schedule-day__entry-chip">{trainingChip}</span> : null}
    </>
  )

  const entryClass = [
    'trainer-schedule-day__entry',
    hasClients ? 'trainer-schedule-day__entry--clients' : 'trainer-schedule-day__entry--note',
    `trainer-schedule-day__entry--kind trainer-schedule-kind--${kind}`,
    state.draft ? 'trainer-schedule-day__entry--draft' : '',
    trainerName ? 'trainer-schedule-day__entry--with-trainer' : '',
    compact ? 'trainer-schedule-day__entry--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={[
        'trainer-schedule-day__entry-wrap',
        hasClients ? 'trainer-schedule-day__entry-wrap--clients' : 'trainer-schedule-day__entry-wrap--note',
        laneCount > 1 ? 'trainer-schedule-day__entry-wrap--lane' : '',
        compact ? 'trainer-schedule-day__entry-wrap--compact' : '',
        variant === 'drag-source' ? 'trainer-schedule-day__entry-wrap--drag-source' : '',
        ghost ? 'trainer-schedule-day__entry-wrap--ghost' : '',
        state.done ? 'trainer-schedule-day__entry-wrap--done' : state.past ? 'trainer-schedule-day__entry-wrap--past' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-hidden={ghost || undefined}
    >
      {ghost ? (
        <div className={entryClass}>{body}</div>
      ) : (
        <button
          type="button"
          className={entryClass}
          onClick={onOpen}
          title={titleParts.join(' · ')}
          aria-label={titleParts.join(', ')}
          {...dragHandlers}
        >
          {body}
        </button>
      )}
      {showStart ? (
        <button
          type="button"
          className="btn btn-icon-square btn-primary trainer-schedule-day__entry-start"
          title={start.label}
          aria-label={start.label}
          onClick={(ev) => {
            ev.stopPropagation()
            if (start.kind === 'pick_client') onOpen?.()
            else nav(start.path)
          }}
        >
          <Play size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
