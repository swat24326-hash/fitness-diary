import { Users } from 'lucide-react'
import { toggleDispatchRecipientId } from '../../lib/admin/iskraDispatchRecipientCore.js'

/**
 * @param {{
 *   mode: 'one' | 'several' | 'all',
 *   onModeChange: (mode: 'one' | 'several' | 'all') => void,
 *   options: Array<{ trainer_id: string, trainer_name?: string, role_label?: string }>,
 *   singleId: string,
 *   onSingleIdChange: (id: string) => void,
 *   multiIds: string[],
 *   onMultiIdsChange: (ids: string[]) => void,
 *   disabled?: boolean,
 * }} props
 */
export function DispatchRecipientPicker({
  mode,
  onModeChange,
  options,
  singleId,
  onSingleIdChange,
  multiIds,
  onMultiIdsChange,
  disabled = false,
}) {
  const canPickMulti = options.length > 1

  return (
    <div className="iskra-dispatch__recipient">
      {canPickMulti ? (
        <div className="iskra-dispatch__recipient-mode" role="group" aria-label="Кому отправить">
          <button
            type="button"
            className={`iskra-dispatch__recipient-mode-btn${mode === 'one' ? ' iskra-dispatch__recipient-mode-btn--on' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange('one')}
          >
            Один
          </button>
          <button
            type="button"
            className={`iskra-dispatch__recipient-mode-btn${mode === 'several' ? ' iskra-dispatch__recipient-mode-btn--on' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange('several')}
          >
            Несколько
          </button>
          <button
            type="button"
            className={`iskra-dispatch__recipient-mode-btn${mode === 'all' ? ' iskra-dispatch__recipient-mode-btn--on' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange('all')}
          >
            Все ({options.length})
          </button>
        </div>
      ) : null}

      {mode === 'one' || !canPickMulti ? (
        <select
          className="select iskra-dispatch__recipient-select"
          value={singleId}
          onChange={(e) => onSingleIdChange(e.target.value)}
          disabled={disabled || !options.length}
        >
          {!options.length ? <option value="">Нет исполнителей</option> : null}
          {options.map((t) => (
            <option key={t.trainer_id} value={t.trainer_id}>
              {t.role_label ? `${t.role_label}: ` : ''}
              {t.trainer_name || t.trainer_id}
            </option>
          ))}
        </select>
      ) : null}

      {mode === 'several' && canPickMulti ? (
        <div className="iskra-dispatch__recipient-pick">
          <p className="iskra-dispatch__recipient-pick-hint muted">
            <Users size={13} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
            Отметьте 2–3 человек (или больше). Выбрано: {multiIds.length}
          </p>
          <ul className="iskra-dispatch__recipient-chips" role="listbox" aria-label="Исполнители">
            {options.map((t) => {
              const on = multiIds.includes(t.trainer_id)
              return (
                <li key={t.trainer_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`iskra-dispatch__recipient-chip${on ? ' iskra-dispatch__recipient-chip--on' : ''}`}
                    disabled={disabled}
                    onClick={() => onMultiIdsChange(toggleDispatchRecipientId(multiIds, t.trainer_id))}
                  >
                    {t.role_label ? <span className="iskra-dispatch__recipient-chip-role">{t.role_label}</span> : null}
                    <span>{t.trainer_name || t.trainer_id}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {mode === 'all' && canPickMulti ? (
        <p className="iskra-dispatch__recipient-all-note">
          Задание получат все активные сотрудники ({options.length}).
        </p>
      ) : null}
    </div>
  )
}
