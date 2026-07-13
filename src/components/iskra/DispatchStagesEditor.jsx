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
      <div className="iskra-dispatch__stages-head">
        <p className="iskra-dispatch__stages-label">
          <ListOrdered size={14} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
          Этапы задания
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || !canAdd}
          onClick={addStage}
        >
          <Plus size={14} aria-hidden />
          Добавить этап
        </button>
      </div>

      {!stages.length ? (
        <p className="iskra-dispatch__stages-hint muted">
          Опционально: разбейте задание на шаги — исполнитель отмечает каждый этап отдельно.
        </p>
      ) : (
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
                placeholder={`Этап ${idx + 1}`}
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
      )}

      {stages.length ? (
        <p className="iskra-dispatch__stages-meta muted">
          Этапов: {stages.filter((s) => String(s).trim()).length} · максимум {DISPATCH_STAGES_MAX}
        </p>
      ) : null}
    </div>
  )
}
