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
import { useScheduleSwipe } from '../../hooks/useScheduleSwipe.js'
import { TrainerScheduleEntryBlock } from './TrainerScheduleEntryBlock.jsx'
import { TrainerScheduleKindLegend } from './TrainerScheduleKindPicker.jsx'

const PX_PER_MIN_DEFAULT = 1.4
const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60
const DAY_END_MIN = SCHEDULE_DAY_END_HOUR * 60
/** Узкий экран (телефон тренера) переопределяет через CSS `--schedule-col-min` / `--schedule-time-col`. */
const COL_MIN = 'var(--schedule-col-min, 96px)'
const TIME_COL = 'var(--schedule-time-col, 52px)'

const ENTRY_MIN_HEIGHT_WITH_TRAINER = 78
const ENTRY_MIN_HEIGHT = 48
const ENTRY_MIN_HEIGHT_COMPACT = 36

/** @param {number} minutes @param {number} pxPerMin */
function scrollTopForMinutes(minutes, pxPerMin) {
  return Math.max(0, (minutes - DAY_START_MIN) * pxPerMin - 8)
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
 *   canStartTraining?: boolean,
 *   showTrainerName?: boolean,
 *   pxPerMin?: number,
 *   swipeNav?: boolean,
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
  canStartTraining = true,
  showTrainerName = false,
  pxPerMin = PX_PER_MIN_DEFAULT,
  swipeNav = false,
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
  const trackHeight = (DAY_END_MIN - DAY_START_MIN) * pxPerMin
  const hours = []
  for (let h = SCHEDULE_DAY_START_HOUR; h < SCHEDULE_DAY_END_HOUR; h++) hours.push(h)
  const title = formatScheduleViewRangeLabel(days, formatDateRu)
  const rangeKey = days.join('|')
  const multiGrid = {
    gridTemplateColumns: `${TIME_COL} repeat(${days.length}, minmax(${COL_MIN}, 1fr))`,
    minWidth: `calc(${TIME_COL} + ${days.length} * (${COL_MIN} + 8px))`,
  }

  const drag = useTrainerScheduleDrag({
    boardRef,
    dayIsos: days,
    enabled: !readOnly && typeof onMoveEntry === 'function',
    pxPerMin,
    dayStartMin: DAY_START_MIN,
    resolvePolicy: (entry) =>
      resolveScheduleDragPolicy(entry, entry.linked_training_id ? trainingById[entry.linked_training_id] : null),
    onDrop: (entry, dayIso, startMinutes) => onMoveEntry?.(entry, dayIso, startMinutes),
    onLocked: (entry) => onMoveLocked?.(entry),
  })
  const preview = drag.preview
  const draggedEntry = preview ? entries.find((e) => String(e.id) === preview.entryId) : null
  const previewRef = useRef(preview)
  previewRef.current = preview
  const swipeAreaRef = useRef(/** @type {HTMLElement | null} */ (null))
  const swipeContentRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  useScheduleSwipe({
    areaRef: swipeAreaRef,
    contentRef: swipeContentRef,
    enabled: swipeNav,
    isBlocked: () => previewRef.current != null,
    onPrev,
    onNext,
  })

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes(days, today, nowMinutes), pxPerMin)
  }, [rangeKey])

  const goToday = () => {
    onToday?.()
    const el = boardRef.current
    if (el) el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes([today], today, nowMinutes), pxPerMin)
  }

  const minHeight = compact
    ? ENTRY_MIN_HEIGHT_COMPACT
    : showTrainerName
      ? ENTRY_MIN_HEIGHT_WITH_TRAINER
      : ENTRY_MIN_HEIGHT

  const entryStyle = (entry, startMinutes, laneIndex, laneCount) => {
    const widthPct = 100 / laneCount
    return {
      top: (startMinutes - DAY_START_MIN) * pxPerMin,
      height: Math.max(minHeight, (Number(entry.duration_minutes) || 60) * pxPerMin - 4),
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
        style={{ height: trackHeight }}
        data-schedule-day={dayIso}
      >
        {hours.map((h) =>
          readOnly ? (
            <div
              key={`slot-${dayIso}-${h}`}
              className="trainer-schedule-day__hour-slot trainer-schedule-day__hour-slot--readonly"
              style={{ top: (h * 60 - DAY_START_MIN) * pxPerMin, height: 60 * pxPerMin }}
            />
          ) : (
            <button
              key={`slot-${dayIso}-${h}`}
              type="button"
              className="trainer-schedule-day__hour-slot"
              style={{ top: (h * 60 - DAY_START_MIN) * pxPerMin, height: 60 * pxPerMin }}
              onClick={() => onAddAt(dayIso, h * 60)}
              aria-label={`Добавить запись ${formatDateRu(dayIso)} в ${formatScheduleMinutes(h * 60)}`}
            />
          ),
        )}
        {nowLine != null ? (
          <div
            className="trainer-schedule-day__now"
            style={{ top: (nowLine - DAY_START_MIN) * pxPerMin }}
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
              canStartTraining={canStartTraining}
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
        <div key={h} className="trainer-schedule-day__hour-label" style={{ height: 60 * pxPerMin }}>
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
        swipeNav ? 'trainer-schedule-day--swipe' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Расписание: ${title}`}
      ref={swipeAreaRef}
    >
      <div className="trainer-schedule-day__head">
        <div className="trainer-schedule-day__nav">
          {swipeNav ? null : (
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onPrev} aria-label="Назад">
              <ChevronLeft size={20} aria-hidden />
            </button>
          )}
          <h2 className="trainer-schedule-day__title">{title}</h2>
          {swipeNav ? null : (
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onNext} aria-label="Вперёд">
              <ChevronRight size={20} aria-hidden />
            </button>
          )}
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
            <span className="trainer-schedule-day__add-label">Запись</span>
          </button>
        ) : readOnly ? (
          <span className="trainer-schedule-day__readonly-badge muted">Только просмотр</span>
        ) : null}
      </div>

      {compact ? (
        <div className="trainer-schedule-day__scroll" ref={swipeContentRef}>
          <div className="trainer-schedule-day__col-heads" style={multiGrid}>
            <span className="trainer-schedule-day__col-heads-spacer" aria-hidden />
            {days.map((dayIso) => {
              const isToday = dayIso === today
              const headLabel = (
                <>
                  <span className="trainer-schedule-day__col-wd">{weekdayShortRu(dayIso)}</span>{' '}
                  <span className="trainer-schedule-day__col-date">{formatDateRu(dayIso).slice(0, 5)}</span>
                </>
              )
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
        <div
          className="trainer-schedule-day__board"
          ref={(el) => {
            boardRef.current = el
            swipeContentRef.current = el
          }}
        >
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
