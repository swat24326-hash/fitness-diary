import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { HOMEWORK_BLOCK_WEEKS } from '../../lib/homework/auto/homeworkGoalFormulas.js'
import { formatHomeworkAutoDay, homeworkWeekSendIso } from '../../lib/homework/auto/homeworkAutoScheduleCore.js'
import { groupHomeworkSessionBlocks } from '../../lib/homework/homeworkSessionGroups.js'

function ExerciseRow({ ex, readOnly, onPatch, onRemove }) {
  return (
    <li className="homework-preview__row">
      <span className="homework-preview__name">{ex.name}</span>
      {!readOnly ? (
        <div className="homework-preview__meta-inputs" aria-label={`Нормы для ${ex.name}`}>
          <label className="homework-preview__field">
            <span>подх.</span>
            <input
              className="input input-sm"
              type="number"
              min={1}
              max={20}
              value={ex.sets}
              onChange={(e) => onPatch({ sets: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="homework-preview__field">
            <span>повт.</span>
            <input className="input input-sm" value={ex.reps} onChange={(e) => onPatch({ reps: e.target.value })} />
          </label>
          <label className="homework-preview__field">
            <span>отдых</span>
            <input
              className="input input-sm"
              type="number"
              min={0}
              max={600}
              value={ex.rest_sec}
              onChange={(e) => onPatch({ rest_sec: Number(e.target.value) || 0 })}
            />
          </label>
          <button
            type="button"
            className="btn-icon-square btn-touch"
            aria-label={`Убрать ${ex.name}`}
            title="Убрать"
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : (
        <span className="homework-preview__chip">
          {ex.sets}×{ex.reps}
          {ex.rest_sec > 0 ? ` · ${ex.rest_sec} с` : ''}
        </span>
      )}
    </li>
  )
}

function Burger({ className, startOpen, summary, children }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        setOpen((v) => (v === next ? v : next))
      }}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  )
}

function SessionBurger({ session, weekIndex, readOnly, open, sendDay, onPatch, onRemove }) {
  const count = session.parts.reduce((n, part) => n + (part.block.exercises?.length ?? 0), 0)
  return (
    <Burger
      className="homework-session"
      startOpen={open}
      summary={
        <>
          Занятие {session.key}
          <span className="homework-week__meta">{sendDay || `${count} упр.`}</span>
        </>
      }
    >
      <div className="homework-session__body">
        {session.parts.map((part) => (
          <div key={part.blockIdx} className="homework-preview__block">
            <h4 className="homework-preview__block-title">{part.block.label}</h4>
            <ul className="homework-preview__list">
              {(part.block.exercises ?? []).map((ex, exIdx) => (
                <ExerciseRow
                  key={`${ex.library_id ?? ex.name}-${exIdx}`}
                  ex={ex}
                  readOnly={readOnly}
                  onPatch={(patch) => onPatch(weekIndex, part.blockIdx, exIdx, patch)}
                  onRemove={() => onRemove(weekIndex, part.blockIdx, exIdx)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Burger>
  )
}

/** Четыре недели блока: неделя и занятие раскрываются отдельно, нормы правятся внутри. */
function weekSendLabel(sendSunday, activeWeek, week, current) {
  if (!sendSunday) return current ? 'уйдёт клиенту' : ''
  const day = formatHomeworkAutoDay(homeworkWeekSendIso(sendSunday, activeWeek, week))
  if (current) return `${day} · уйдёт`
  if (week < activeWeek) return `${day} · уже было`
  return day
}

export function HomeworkWeekStack({ weeks, activeWeek = 1, sendSunday = null, readOnly = false, onPatchExercise, onRemoveExercise }) {
  const stamp = weeks.map((item) => item.draft?.blocks?.length ?? 0).join('-')
  return (
    <div className="homework-weeks" key={`${activeWeek}:${stamp}`}>
      {weeks.map((item, weekIndex) => {
        const { sessions, rest } = groupHomeworkSessionBlocks(item.draft?.blocks)
        const current = item.week === activeWeek
        const sendDay = sendSunday ? formatHomeworkAutoDay(homeworkWeekSendIso(sendSunday, activeWeek, item.week)) : ''
        return (
          <Burger
            key={item.week}
            className={`homework-week${current ? ' homework-week--active' : ''}`}
            startOpen={current}
            summary={
              <>
                Неделя {item.week} из {HOMEWORK_BLOCK_WEEKS}
                <span className="homework-week__meta">{weekSendLabel(sendSunday, activeWeek, item.week, current)}</span>
              </>
            }
          >
            <div className="homework-week__body">
              {sessions.map((session, sIdx) => (
                <SessionBurger
                  key={session.key}
                  session={session}
                  weekIndex={weekIndex}
                  readOnly={readOnly}
                  open={current && sIdx === 0}
                  sendDay={sendDay}
                  onPatch={onPatchExercise}
                  onRemove={onRemoveExercise}
                />
              ))}
              {rest.map((part) => (
                <div key={part.blockIdx} className="homework-preview__block">
                  <h4 className="homework-preview__block-title">{part.block.label}</h4>
                  <ul className="homework-preview__list">
                    {(part.block.exercises ?? []).map((ex, exIdx) => (
                      <ExerciseRow
                        key={`${ex.name}-${exIdx}`}
                        ex={ex}
                        readOnly={readOnly}
                        onPatch={(patch) => onPatchExercise?.(weekIndex, part.blockIdx, exIdx, patch)}
                        onRemove={() => onRemoveExercise?.(weekIndex, part.blockIdx, exIdx)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Burger>
        )
      })}
    </div>
  )
}
