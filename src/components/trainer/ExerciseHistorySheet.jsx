import { useMemo } from 'react'
import { CloseButton } from '../CloseButton'
import { formatDateRu } from '../../lib/dateRu'
import { formatSetSummary } from '../../lib/trainingExerciseFormat'
import { collectSetLoadNums } from '../../lib/trainingSetLateralityCore'

/**
 * Окно истории упражнения поверх тренировки (из «Прошлый раз»).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   exerciseName?: string,
 *   rows?: object[],
 *   total?: number,
 * }} props
 */
export function ExerciseHistorySheet({ open, onClose, exerciseName = '', rows = [], total = 0 }) {
  const sparkPoints = useMemo(() => {
    const chron = [...(rows ?? [])].reverse()
    /** @type {{ date: string, value: number }[]} */
    const pts = []
    for (const row of chron) {
      const nums = collectSetLoadNums(row?.sets, 'weight_kg')
      if (!nums.length) continue
      pts.push({ date: String(row?.date ?? '').slice(0, 10), value: Math.max(...nums) })
    }
    return pts
  }, [rows])

  const sparkPath = useMemo(() => buildSparkPath(sparkPoints), [sparkPoints])

  if (!open) return null

  const title = String(exerciseName ?? '').trim() || 'Упражнение'
  const shown = rows?.length ?? 0
  const truncated = Number(total) > shown

  return (
    <div
      className="modal-overlay exercise-history-sheet-overlay"
      style={{ alignItems: 'center' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-history-title"
      onClick={onClose}
    >
      <div className="exercise-history-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="exercise-history-sheet__head">
          <h4 id="exercise-history-title" className="exercise-history-sheet__title">
            {title}
          </h4>
          <CloseButton onClick={onClose} size={22} touch />
        </div>
        <p className="exercise-history-sheet__lead muted">История по упражнению</p>

        {sparkPath ? (
          <div className="exercise-history-sheet__spark" aria-hidden="true">
            <svg viewBox="0 0 120 36" preserveAspectRatio="none" className="exercise-history-sheet__spark-svg">
              <path d={sparkPath.area} className="exercise-history-sheet__spark-area" />
              <path d={sparkPath.line} className="exercise-history-sheet__spark-line" fill="none" />
            </svg>
            <div className="exercise-history-sheet__spark-meta muted">
              <span>макс. вес</span>
              <span>
                {sparkPoints[0]?.value} → {sparkPoints[sparkPoints.length - 1]?.value} кг
              </span>
            </div>
          </div>
        ) : null}

        <div className="exercise-history-sheet__list">
          {shown === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Нет завершённых тренировок с этим упражнением.
            </p>
          ) : (
            rows.map((row) => (
              <article key={row.trainingId || row.date} className="exercise-history-sheet__item">
                <p className="exercise-history-sheet__item-date">
                  {formatDateRu(row.date)}
                </p>
                {(row.sets ?? []).map((st, setIdx) => (
                  <p key={setIdx} className="exercise-history-sheet__item-set muted">
                    {setIdx + 1}) {formatSetSummary(st, row.format)}
                  </p>
                ))}
                {row.muscle_focus ? (
                  <p className="exercise-history-sheet__item-focus muted">Акцент: {row.muscle_focus}</p>
                ) : null}
              </article>
            ))
          )}
        </div>

        {truncated ? (
          <p className="exercise-history-sheet__cap muted">Показаны последние {shown} из {total}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * @param {{ value: number }[]} points
 * @returns {{ line: string, area: string } | null}
 */
function buildSparkPath(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 120
  const h = 36
  const padY = 4
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = padY + (1 - (p.value - min) / span) * (h - padY * 2)
    return [x, y]
  })
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  const first = coords[0]
  const area = `${line} L${last[0].toFixed(1)} ${h} L${first[0].toFixed(1)} ${h} Z`
  return { line, area }
}
