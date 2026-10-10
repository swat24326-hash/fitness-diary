import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_START_HOUR,
  assignScheduleEntryLanes,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
  formatScheduleViewRangeLabel,
  weekdayShortRu,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  resolveScheduleInitialScrollMinutes,
  resolveScheduleNowLineMinutes,
} from '../../lib/trainer/trainerScheduleNowCore.js'
import { resolveScheduleDragPolicy } from '../../lib/trainer/trainerScheduleDragCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { useTrainerScheduleNow } from '../../hooks/useTrainerScheduleNow.js'
import { useTrainerScheduleDrag } from '../../hooks/useTrainerScheduleDrag.js'
import { TrainerScheduleEntryBlock } from './TrainerScheduleEntryBlock.jsx'
import { TrainerScheduleKindLegend } from './TrainerScheduleKindPicker.jsx'

const PX_PER_MIN = 1.4
const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60
const DAY_END_MIN = SCHEDULE_DAY_END_HOUR * 60
const TRACK_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN
const COL_MIN_PX = 96

const ENTRY_MIN_HEIGHT_WITH_TRAINER = 78
const ENTRY_MIN_HEIGHT = 48
const ENTRY_MIN_HEIGHT_COMPACT = 36

/** @param {number} minutes */
function scrollTopForMinutes(minutes) {
  return Math.max(0, (minutes - DAY_START_MIN) * PX_PER_MIN - 8)
}

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
 *   onToday?: () => void,
 *   onOpenDay?: (dayIso: string) => void,
 *   onAddAt: (dayIso: string, minutes: number) => void,
 *   onOpenEntry: (entry: object) => void,
 *   onMoveEntry?: (entry: object, dayIso: string, startMinutes: number) => void,
 *   onMoveLocked?: (entry: object) => void,
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
  onToday,
  onOpenDay,
  onAddAt,
  onOpenEntry,
  onMoveEntry,
  onMoveLocked,
}) {
  const boardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const days = (dayIsos ?? []).map((d) => String(d).slice(0, 10)).filter(Boolean)
  const compact = days.length > 1
  const now = useTrainerScheduleNow()
  const { todayIso: today, nowMinutes } = now
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

  const drag = useTrainerScheduleDrag({
    boardRef,
    dayIsos: days,
    enabled: !readOnly && typeof onMoveEntry === 'function',
    pxPerMin: PX_PER_MIN,
    dayStartMin: DAY_START_MIN,
    resolvePolicy: (entry) =>
      resolveScheduleDragPolicy(entry, entry.linked_training_id ? trainingById[entry.linked_training_id] : null),
    onDrop: (entry, dayIso, startMinutes) => onMoveEntry?.(entry, dayIso, startMinutes),
    onLocked: (entry) => onMoveLocked?.(entry),
  })
  const preview = drag.preview
  const draggedEntry = preview ? entries.find((e) => String(e.id) === preview.entryId) : null

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes(days, today, nowMinutes))
  }, [rangeKey])

  const goToday = () => {
    onToday?.()
    const el = boardRef.current
    if (el) el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes([today], today, nowMinutes))
  }

  const minHeight = compact
    ? ENTRY_MIN_HEIGHT_COMPACT
    : showTrainerName
      ? ENTRY_MIN_HEIGHT_WITH_TRAINER
      : ENTRY_MIN_HEIGHT

  const entryStyle = (entry, startMinutes, laneIndex, laneCount) => {
    const widthPct = 100 / laneCount
    return {
      top: (startMinutes - DAY_START_MIN) * PX_PER_MIN,
      height: Math.max(minHeight, (Number(entry.duration_minutes) || 60) * PX_PER_MIN - 4),
      left: `${laneIndex * widthPct}%`,
      width: `calc(${widthPct}% - ${compact ? 2 : 4}px)`,
      right: 'auto',
    }
  }

  const renderDayTrack = (dayIso) => {
    const dayEntries = filterScheduleEntriesForDay(entries, dayIso)
    const entryLanes = assignScheduleEntryLanes(dayEntries)
    const nowLine = resolveScheduleNowLineMinutes(dayIso, today, nowMinutes)
    return (
      <div
        key={dayIso}
        className="trainer-schedule-day__track"
        style={{ height: TRACK_HEIGHT }}
        data-schedule-day={dayIso}
      >
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
        {nowLine != null ? (
          <div
            className="trainer-schedule-day__now"
            style={{ top: (nowLine - DAY_START_MIN) * PX_PER_MIN }}
            title={`Сейчас ${formatScheduleMinutes(nowLine)}`}
            aria-hidden
          />
        ) : null}
        {dayEntries.map((entry) => {
          const lane = entryLanes.get(String(entry.id)) ?? { lane: 0, laneCount: 1 }
          const laneCount = Math.max(1, Number(lane.laneCount) || 1)
          const laneIndex = Math.min(Math.max(0, Number(lane.lane) || 0), laneCount - 1)
          const trainerName =
            showTrainerName && entry.trainer_id ? trainerNameById[String(entry.trainer_id)] ?? 'Тренер' : ''
          return (
            <TrainerScheduleEntryBlock
              key={entry.id}
              entry={entry}
              style={entryStyle(entry, Number(entry.start_minutes), laneIndex, laneCount)}
              compact={compact}
              laneCount={laneCount}
              trainerName={trainerName}
              clientNameById={clientNameById}
              trainingById={trainingById}
              now={now}
              readOnly={readOnly}
              variant={preview?.entryId === String(entry.id) ? 'drag-source' : 'normal'}
              dragHandlers={drag.getEntryHandlers(entry)}
              onOpen={() => {
                if (drag.consumeSuppressedClick()) return
                onOpenEntry(entry)
              }}
            />
          )
        })}
        {draggedEntry && preview.dayIso === dayIso ? (
          <TrainerScheduleEntryBlock
            entry={{ ...draggedEntry, day_date: dayIso, start_minutes: preview.startMinutes }}
            style={entryStyle(draggedEntry, preview.startMinutes, 0, 1)}
            compact={compact}
            laneCount={1}
            clientNameById={clientNameById}
            trainingById={trainingById}
            now={now}
            readOnly
            variant="ghost"
          />
        ) : null}
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
        preview ? 'trainer-schedule-day--dragging' : '',
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
        {onToday ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm trainer-schedule-day__today"
            onClick={goToday}
            title="Перейти к сегодняшнему дню и текущему времени"
          >
            Сегодня
          </button>
        ) : null}
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
      <TrainerScheduleKindLegend />
    </section>
  )
}
