import { Pencil } from 'lucide-react'
import { clientNeedsArchiveReason } from '../lib/clientArchiveReasonCore.js'

/**
 * Карандаш «причина архива» — в ряду действий карточки, как Max / карточка.
 * @param {{
 *   client: object,
 *   busy?: boolean,
 *   onEdit?: (client: object) => void,
 * }} props
 */
export function ClientArchiveReasonEditButton({ client, busy = false, onEdit }) {
  if (!client?.archived_at || typeof onEdit !== 'function') return null
  const needs = clientNeedsArchiveReason(client)
  const label = needs ? 'Указать причину архива' : 'Изменить причину архива'
  return (
    <button
      type="button"
      className={`btn btn-icon-square btn-touch btn-ghost client-archive-reason-edit${needs ? ' client-archive-reason-edit--missing' : ''}`}
      disabled={busy}
      onClick={() => onEdit(client)}
      title={label}
      aria-label={label}
    >
      <Pencil size={20} aria-hidden />
    </button>
  )
}
