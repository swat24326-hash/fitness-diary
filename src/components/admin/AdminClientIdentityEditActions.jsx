import { Pencil, Save } from 'lucide-react'

/**
 * Действия блока ФИО/контактов: карандаш в просмотре, Сохранить/Отменить в правке.
 *
 * @param {{
 *   editing: boolean,
 *   busy?: boolean,
 *   onBeginEdit: () => void,
 *   onCancel: () => void,
 *   extra?: import('react').ReactNode,
 * }} props
 */
export function AdminClientIdentityEditActions({
  editing,
  busy = false,
  onBeginEdit,
  onCancel,
  extra = null,
}) {
  return (
    <div className="admin-desk-client-card__actions">
      {editing ? (
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            Отменить
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={18} aria-hidden /> {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-icon-square"
          disabled={busy}
          onClick={onBeginEdit}
          title="Изменить данные клиента"
          aria-label="Изменить данные клиента"
        >
          <Pencil size={18} aria-hidden />
        </button>
      )}
      {extra}
    </div>
  )
}
