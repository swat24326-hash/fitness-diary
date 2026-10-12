import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_START_HOUR,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
  formatScheduleViewRangeLabel,
} from '../../lib/trainer/trainerScheduleCore.js'
import { resolveScheduleInitialScrollMinutes } from '../../lib/trainer/trainerScheduleNowCore.js'
import { resolveScheduleDragPolicy } from '../../lib/trainer/trainerScheduleDragCore.js'
import { resolveScheduleEntryMinHeight } from '../../lib/trainer/scheduleZoomCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { useTrainerScheduleNow } from '../../hooks/useTrainerScheduleNow.js'
import { useTrainerScheduleDrag } from '../../hooks/useTrainerScheduleDrag.js'
import { useScheduleSwipe } from '../../hooks/useScheduleSwipe.js'
import { useScheduleZoomGesture } from '../../hooks/useScheduleZoomGesture.js'
import { TrainerScheduleDayTrack } from './TrainerScheduleDayTrack.jsx'
import { TrainerScheduleColHeads } from './TrainerScheduleColHeads.jsx'
import { TrainerScheduleKindLegend } from './TrainerScheduleKindPicker.jsx'

const PX_PER_MIN_DEFAULT = 1.4
const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60

const ENTRY_MIN_HEIGHT_WITH_TRAINER = 78
const ENTRY_MIN_HEIGHT = 48
const ENTRY_MIN_HEIGHT_COMPACT = 36

/** @param {number} minutes @param {number} pxPerMin */
function scrollTopForMinutes(minutes, pxPerMin) {
  return Math.max(0, (minutes - DAY_START_MIN) * pxPerMin - 8)
}

/** @param {unknown} list */
function cleanDays(list) {
  return (Array.isArray(list) ? list : []).map((d) => String(d).slice(0, 10)).filter(Boolean)
}

/**
 * @param {{
 *   dayIsos: string[],
 *   prevDayIsos?: string[],
 *   nextDayIsos?: string[],
 *   anchorDayIso?: string,
 *   entries: object[],
 *   clientNameById?: Record<string, string>,
 *   trainerNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   readOnly?: boolean,
 *   canStartTraining?: boolean,
 *   showTrainerName?: boolean,
 *   pxPerMin?: number,
 *   onZoom?: (pxPerMin: number) => void,
 *   swipeNav?: boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onToday?: () => void,
 *   onOpenDay?: (dayIso: string) => void,
 *   onAddAt: (dayIso: string, minutes: number) => void,
 *   onOpenEntry: (entry: object) => void,
 *   onMoveEntry?: (entry: object, dayIso: string, startMinutes: number) => void,
 *   onMoveLocked?: (entry: object) => void,
 *   headEnd?: import('react').ReactNode,
 *   addFab?: boolean,
 *   todayTick?: number,
 * }} props
 * todayTick — «Сегодня» из меню вне сетки: на каждое изменение сетка докручивает к текущему часу.
 * headEnd — кнопка справа в шапке (меню режима «⋮»); слева — пустышка той же ширины, дата по центру.
 * addFab — «+» плавающей кнопкой в правом нижнем углу сетки, как в Google Календаре на телефоне.
 * onZoom — щипок / Ctrl+колёсико меняют pxPerMin (масштаб хранит страница, см. useScheduleZoom).
 * swipeNav + prevDayIsos / nextDayIsos — лента из трёх экранов: соседний въезжает за пальцем,
 * поднятую запись у края сетки уносит на следующий экран (и дальше, если держать).
 * Вертикальная прокрутка при листании не сбрасывается — только при открытии и по «Сегодня».
 */
export function TrainerScheduleMultiDayAgenda({
  dayIsos,
  prevDayIsos,
  nextDayIsos,
  anchorDayIso = '',
  entries,
  clientNameById = {},
  trainerNameById = {},
  trainingById = {},
  readOnly = false,
  canStartTraining = true,
  showTrainerName = false,
  pxPerMin = PX_PER_MIN_DEFAULT,
  onZoom,
  swipeNav = false,
  onPrev,
  onNext,
  onToday,
  onOpenDay,
  onAddAt,
  onOpenEntry,
  onMoveEntry,
  onMoveLocked,
  headEnd = null,
  addFab = false,
  todayTick = 0,
}) {
  const boardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const days = cleanDays(dayIsos)
  const prevDays = cleanDays(prevDayIsos)
  const nextDays = cleanDays(nextDayIsos)
  const carousel = swipeNav && prevDays.length > 0 && nextDays.length > 0
  const pages = carousel ? [prevDays, days, nextDays] : [days]
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
  const pageGrid = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }

  const swipeAreaRef = useRef(/** @type {HTMLElement | null} */ (null))
  const headsStripRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const tracksStripRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const flipRef = useRef(/** @type {(commit: 'next' | 'prev') => void} */ (() => {}))

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
    onEdgeFlip: carousel ? (dir) => flipRef.current(dir > 0 ? 'next' : 'prev') : undefined,
  })
  const preview = drag.preview
  const previewRef = useRef(preview)
  previewRef.current = preview
  const swipe = useScheduleSwipe({
    areaRef: swipeAreaRef,
    contentRef: [headsStripRef, tracksStripRef],
    enabled: swipeNav,
    isBlocked: () => previewRef.current != null,
    onPrev,
    onNext,
    carousel,
    pageKey: rangeKey,
  })
  flipRef.current = swipe.flip
  useScheduleZoomGesture({
    boardRef,
    zoom: pxPerMin,
    onZoom,
    isBlocked: () => previewRef.current != null,
  })

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes(days, today, nowMinutes), pxPerMin)
  }, [todayTick])

  const goToday = () => {
    onToday?.()
    const el = boardRef.current
    if (el) el.scrollTop = scrollTopForMinutes(resolveScheduleInitialScrollMinutes([today], today, nowMinutes), pxPerMin)
  }

  const addButton =
    !readOnly && addDefaultDay ? (
      <button
        type="button"
        className={['btn btn-primary btn-sm trainer-schedule-day__add', addFab ? 'trainer-schedule-day__add--fab' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={() => onAddAt(addDefaultDay, 10 * 60)}
        aria-label="Новая запись"
      >
        <Plus size={addFab ? 20 : 18} aria-hidden />
        {addFab ? null : <span className="trainer-schedule-day__add-label">Запись</span>}
      </button>
    ) : null

  const minHeight = resolveScheduleEntryMinHeight(
    compact ? ENTRY_MIN_HEIGHT_COMPACT : showTrainerName ? ENTRY_MIN_HEIGHT_WITH_TRAINER : ENTRY_MIN_HEIGHT,
    pxPerMin,
  )
  const stripClass = ['trainer-schedule-day__strip', carousel ? 'trainer-schedule-day__strip--carousel' : '']
    .filter(Boolean)
    .join(' ')
  /** Экран ленты: соседние видны, пока въезжают, но скрыты от скринридера и не нажимаются. */
  const pageProps = (pageDays) => {
    const current = pageDays === days
    return { className: 'trainer-schedule-day__page', style: pageGrid, 'aria-hidden': current ? undefined : true }
  }

  return (
    <section
      className={[
        'trainer-schedule-day card',
        compact ? 'trainer-schedule-day--multi' : '',
        days.length >= 7 ? 'trainer-schedule-day--week' : '',
        preview ? 'trainer-schedule-day--dragging' : '',
        preview?.edge ? `trainer-schedule-day--edge-${preview.edge > 0 ? 'next' : 'prev'}` : '',
        swipeNav ? 'trainer-schedule-day--swipe' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Расписание: ${title}`}
      ref={swipeAreaRef}
    >
      <div className="trainer-schedule-day__head">
        {headEnd ? <span className="trainer-schedule-day__head-spacer" aria-hidden /> : null}
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
        {addButton && !addFab ? (
          addButton
        ) : readOnly && !headEnd ? (
          <span className="trainer-schedule-day__readonly-badge muted">Только просмотр</span>
        ) : null}
        {headEnd}
      </div>

      <div className="trainer-schedule-day__body">
        {compact ? (
          <div className="trainer-schedule-day__col-heads">
            <span className="trainer-schedule-day__col-heads-spacer" aria-hidden />
            <div className="trainer-schedule-day__viewport">
              <div className={stripClass} ref={headsStripRef}>
                {pages.map((pageDays) => (
                  <div key={pageDays[0]} {...pageProps(pageDays)}>
                    <TrainerScheduleColHeads
                      dayIsos={pageDays}
                      todayIso={today}
                      interactive={pageDays === days}
                      onOpenDay={onOpenDay}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div className="trainer-schedule-day__board" ref={boardRef}>
          <div className="trainer-schedule-day__hours" aria-hidden>
            {hours.map((h) => (
              <div key={h} className="trainer-schedule-day__hour-label" style={{ height: 60 * pxPerMin }}>
                {formatScheduleMinutes(h * 60)}
              </div>
            ))}
          </div>
          <div className="trainer-schedule-day__viewport">
            <div className={stripClass} ref={tracksStripRef}>
              {pages.map((pageDays) => (
                <div key={pageDays[0]} {...pageProps(pageDays)}>
                  {pageDays.map((dayIso) => (
                    <TrainerScheduleDayTrack
                      key={dayIso}
                      dayIso={dayIso}
                      entries={entries}
                      pxPerMin={pxPerMin}
                      minHeight={minHeight}
                      compact={compact}
                      interactive={pageDays === days}
                      readOnly={readOnly}
                      canStartTraining={canStartTraining}
                      showTrainerName={showTrainerName}
                      clientNameById={clientNameById}
                      trainerNameById={trainerNameById}
                      trainingById={trainingById}
                      now={now}
                      preview={preview}
                      drag={drag}
                      onAddAt={onAddAt}
                      onOpenEntry={onOpenEntry}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        {addFab ? addButton : null}
      </div>

      {days.every((d) => filterScheduleEntriesForDay(entries, d).length === 0) ? (
        <p className="trainer-schedule-day__empty muted">
          {readOnly
            ? 'На этот период записей нет.'
            : addFab
              ? 'Нажмите на час или «+», чтобы добавить пометку или клиента.'
              : 'Нажмите на час или «Запись», чтобы добавить пометку или клиента.'}
        </p>
      ) : null}
      <TrainerScheduleKindLegend />
    </section>
  )
}
