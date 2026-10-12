import {
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_START_HOUR,
  assignScheduleEntryLanes,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
} from '../../lib/trainer/trainerScheduleCore.js'
import { resolveScheduleNowLineMinutes } from '../../lib/trainer/trainerScheduleNowCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { TrainerScheduleEntryBlock } from './TrainerScheduleEntryBlock.jsx'

const DAY_START_MIN = SCHEDULE_DAY_START_HOUR * 60
const DAY_END_MIN = SCHEDULE_DAY_END_HOUR * 60
const HOURS = Array.from({ length: SCHEDULE_DAY_END_HOUR - SCHEDULE_DAY_START_HOUR }, (_, i) => SCHEDULE_DAY_START_HOUR + i)

/**
 * Колонка одного дня: часы-кнопки, линия «сейчас», записи и «призрак» переносимой записи.
 * interactive=false — соседний экран ленты листания: виден, пока въезжает, но не нажимается.
 * @param {{
 *   dayIso: string,
 *   entries: object[],
 *   pxPerMin: number,
 *   minHeight: number,
 *   compact: boolean,
 *   interactive: boolean,
 *   readOnly: boolean,
 *   canStartTraining: boolean,
 *   showTrainerName: boolean,
 *   clientNameById: Record<string, string>,
 *   trainerNameById: Record<string, string>,
 *   trainingById: Record<string, object>,
 *   now: { todayIso: string, nowMinutes: number },
 *   preview: { entryId: string, entry: object, dayIso: string, startMinutes: number } | null,
 *   drag: { getEntryHandlers: (entry: object) => object, consumeSuppressedClick: () => boolean },
 *   onAddAt: (dayIso: string, minutes: number) => void,
 *   onOpenEntry: (entry: object) => void,
 * }} props
 */
export function TrainerScheduleDayTrack({
  dayIso,
  entries,
  pxPerMin,
  minHeight,
  compact,
  interactive,
  readOnly,
  canStartTraining,
  showTrainerName,
  clientNameById,
  trainerNameById,
  trainingById,
  now,
  preview,
  drag,
  onAddAt,
  onOpenEntry,
}) {
  const dayEntries = filterScheduleEntriesForDay(entries, dayIso)
  const entryLanes = assignScheduleEntryLanes(dayEntries)
  const nowLine = resolveScheduleNowLineMinutes(dayIso, now.todayIso, now.nowMinutes)
  const slotsReadOnly = readOnly || !interactive

  const entryStyle = (entry, startMinutes, laneIndex, laneCount) => {
    const widthPct = 100 / laneCount
    return {
      top: (startMinutes - DAY_START_MIN) * pxPerMin,
      height: Math.max(minHeight, (Number(entry.duration_minutes) || 60) * pxPerMin - 4),
      minHeight,
      left: `${laneIndex * widthPct}%`,
      width: `calc(${widthPct}% - ${compact ? 2 : 4}px)`,
      right: 'auto',
    }
  }

  return (
    <div className="trainer-schedule-day__track" style={{ height: (DAY_END_MIN - DAY_START_MIN) * pxPerMin }} data-schedule-day={dayIso}>
      {HOURS.map((h) =>
        slotsReadOnly ? (
          <div
            key={`slot-${h}`}
            className="trainer-schedule-day__hour-slot trainer-schedule-day__hour-slot--readonly"
            style={{ top: (h * 60 - DAY_START_MIN) * pxPerMin, height: 60 * pxPerMin }}
          />
        ) : (
          <button
            key={`slot-${h}`}
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
            dragHandlers={interactive ? drag.getEntryHandlers(entry) : {}}
            onOpen={() => {
              if (drag.consumeSuppressedClick()) return
              onOpenEntry(entry)
            }}
          />
        )
      })}
      {preview && preview.dayIso === dayIso ? (
        <TrainerScheduleEntryBlock
          entry={{ ...preview.entry, day_date: dayIso, start_minutes: preview.startMinutes }}
          style={entryStyle(preview.entry, preview.startMinutes, 0, 1)}
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
