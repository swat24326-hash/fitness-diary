import { ListOrdered, Plus, Trash2 } from 'lucide-react'
import { DISPATCH_STAGES_MAX } from '../../lib/admin/iskraDispatchStagesCore.js'

/**
 * @param {{
 *   stages: string[],
 *   onChange: (stages: string[]) => void,
 *   disabled?: boolean,
 * }} props
 */
export function DispatchStagesEditor({ stages, onChange, disabled = false }) {
  const canAdd = stages.length < DISPATCH_STAGES_MAX
  const filledCount = stages.filter((s) => String(s).trim()).length

  const updateAt = (idx, value) => {
    const next = [...stages]
    next[idx] = value
    onChange(next)
  }

  const addStage = () => {
    if (!canAdd) return
    onChange([...stages, ''])
  }

  const removeAt = (idx) => {
    onChange(stages.filter((_, i) => i !== idx))
  }

  return (
    <div className="iskra-dispatch__stages">
      {!stages.length ? (
        <div className="iskra-dispatch__stages-empty">
          <ListOrdered size={22} aria-hidden style={{ opacity: 0.55 }} />
          <p className="muted">
            Разбейте сложное задание на шаги — исполнитель отмечает каждый этап отдельно, «Выполнено» — только когда все готовы.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={addStage}>
            <Plus size={14} aria-hidden />
            Добавить первый этап
          </button>
        </div>
      ) : (
        <>
          <ol className="iskra-dispatch__stages-list">
            {stages.map((title, idx) => (
              <li key={`stage-${idx}`} className="iskra-dispatch__stages-item">
                <span className="iskra-dispatch__stages-num" aria-hidden>
                  {idx + 1}
                </span>
                <input
                  className="input iskra-dispatch__stages-input"
                  value={title}
                  maxLength={120}
                  placeholder={`Шаг ${idx + 1} — что сделать`}
                  disabled={disabled}
                  onChange={(e) => updateAt(idx, e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon-square"
                  disabled={disabled}
                  aria-label={`Удалить этап ${idx + 1}`}
                  onClick={() => removeAt(idx)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <div className="iskra-dispatch__stages-foot">
            <p className="iskra-dispatch__stages-meta muted">
              Заполнено: {filledCount} из {stages.length} · максимум {DISPATCH_STAGES_MAX}
            </p>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || !canAdd} onClick={addStage}>
              <Plus size={14} aria-hidden />
              Ещё этап
            </button>
          </div>
        </>
      )}
    </div>
  )
}
