import { formatArchiveReasonDisplay, clientNeedsArchiveReason } from '../lib/clientArchiveReasonCore.js'

/**
 * Факт «Причина» в карточке списка архива + кнопка указать/изменить.
 * @param {{
 *   client: object,
 *   busy?: boolean,
 *   onEdit?: (client: object) => void,
 * }} props
 */
export function ClientArchiveReasonFact({ client, busy = false, onEdit }) {
  if (!client?.archived_at) return null
  const needs = clientNeedsArchiveReason(client)
  const text = formatArchiveReasonDisplay(client)
  return (
    <div className="td-client-fact client-archive-reason-fact">
      <span className="td-client-fact__label">Причина</span>
      <span
        className={`td-client-fact__value${needs ? ' client-archive-reason-fact__value--missing' : ''}`}
      >
        {text}
        {typeof onEdit === 'function' ? (
          <>
            {' '}
            <button
              type="button"
              className="btn btn-ghost btn-touch btn-xs client-archive-reason-fact__btn"
              disabled={busy}
              onClick={() => onEdit(client)}
              title={needs ? 'Указать причину архива' : 'Изменить причину архива'}
              aria-label={needs ? 'Указать причину архива' : 'Изменить причину архива'}
            >
              {needs ? 'Указать' : 'Изменить'}
            </button>
          </>
        ) : null}
      </span>
    </div>
  )
}
