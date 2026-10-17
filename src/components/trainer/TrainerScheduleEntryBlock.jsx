import { useNavigate } from 'react-router-dom'
import { Check, CloudOff, Play } from 'lucide-react'
import { SCHEDULE_UNSENT_TITLE, isScheduleEntryUnsent } from '../../lib/trainer/trainerScheduleDeliveryCore.js'
import { buildScheduleEntryClientRows } from '../../lib/trainer/trainerScheduleClientInfoCore.js'
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
 *   oneLine?: boolean,
 *   laneCount: number,
 *   trainerName?: string,
 *   clientNameById?: Record<string, string>,
 *   clientInfoById?: Record<string, { name?: string, cardNumber?: string, membershipLabel?: string }>,
 *   trainingById?: Record<string, object>,
 *   now: { todayIso: string, nowMinutes: number },
 *   readOnly?: boolean,
 *   canStartTraining?: boolean,
 *   variant?: 'normal' | 'drag-source' | 'ghost',
 *   dragHandlers?: object,
 *   onOpen?: () => void,
 * }} props
 */
export function TrainerScheduleEntryBlock({
  entry,
  style,
  compact,
  oneLine = false,
  laneCount,
  trainerName = '',
  clientNameById = {},
  clientInfoById = {},
  trainingById = {},
  now,
  readOnly = false,
  canStartTraining = true,
  variant = 'normal',
  dragHandlers = {},
  onOpen,
}) {
  const nav = useNavigate()
  const ghost = variant === 'ghost'
  const label = buildScheduleEntryLabel(entry, clientNameById)
  const showMeta = !compact && !oneLine
  const rows = buildScheduleEntryClientRows(entry, clientNameById, clientInfoById, {
    short: compact,
    withMeta: showMeta,
  })
  const lineNames = rows.map((r) => r.name)
  const linesEl = (
    <span className="trainer-schedule-day__entry-label trainer-schedule-day__entry-lines">
      {rows.map((row, i) => (
        <span key={i} className="trainer-schedule-day__entry-line">
          <span className="trainer-schedule-day__entry-name">{row.name}</span>
          {row.meta ? <span className="trainer-schedule-day__entry-card muted">{row.meta}</span> : null}
        </span>
      ))}
    </span>
  )
  const hasClients = (entry.client_ids ?? []).length > 0
  const linkedTraining = entry.linked_training_id ? trainingById[entry.linked_training_id] : null
  const trainingChip = scheduleEntryTrainingStatusLabel(entry, linkedTraining)
  const start = resolveScheduleTrainingStart(entry, { trainingById, workoutsBase: '/trainer/workouts' })
  const kind = resolveScheduleEntryKind(entry)
  const kindLabel = scheduleKindLabel(kind)
  const state = resolveScheduleEntryState(entry, linkedTraining, now)
  const titleParts = [formatScheduleTimeRange(entry), kindLabel, trainerName, label].filter(Boolean)
  if (showMeta) {
    for (const row of rows) {
      if (row.meta) titleParts.push(row.meta)
    }
  }
  const unsent = !readOnly && !ghost && isScheduleEntryUnsent(entry)
  if (unsent) titleParts.push(SCHEDULE_UNSENT_TITLE)
  const doneMark = (
    <>
      {state.done ? (
        <span className="trainer-schedule-day__entry-done" aria-hidden>
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
      {unsent ? (
        <span className="trainer-schedule-day__entry-unsent" aria-hidden>
          <CloudOff size={12} strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  )
  const showStart =
    canStartTraining &&
    !readOnly &&
    !compact &&
    !ghost &&
    (start.kind === 'open' || start.kind === 'new' || start.kind === 'pick_client')

  const timeLabel = showMeta ? (
    <>
      {formatScheduleTimeRange(entry)}
      <span className="trainer-schedule-day__entry-kind"> · {kindLabel}</span>
    </>
  ) : (
    formatScheduleTimeRange(entry)
  )

  const body = oneLine ? (
    <>
      {doneMark}
      <span className="trainer-schedule-day__entry-label">{lineNames.join(', ')}</span>
      {trainerName && !compact ? <span className="trainer-schedule-day__entry-time">{trainerName}</span> : null}
    </>
  ) : compact ? (
    <>
      <span className="trainer-schedule-day__entry-time">
        {doneMark}
        {formatScheduleMinutes(Number(entry.start_minutes) || 0)}
      </span>
      {linesEl}
    </>
  ) : (
    <>
      {trainerName ? (
        <span className="trainer-schedule-day__entry-meta">
          <span className="trainer-schedule-day__entry-time">
            {doneMark}
            {timeLabel}
          </span>
          <span className="trainer-schedule-day__entry-trainer">{trainerName}</span>
        </span>
      ) : (
        <span className="trainer-schedule-day__entry-time">
          {doneMark}
          {timeLabel}
        </span>
      )}
      {linesEl}
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
    oneLine ? 'trainer-schedule-day__entry--one-line' : '',
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
          className="btn btn-icon-square trainer-schedule-day__entry-start"
          title={start.label}
          aria-label={start.label}
          onClick={(ev) => {
            ev.stopPropagation()
            if (start.kind === 'pick_client') onOpen?.()
            else nav(start.path)
          }}
        >
          <Play fill="currentColor" strokeWidth={0} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
