import { formatArchiveReasonDisplay, clientNeedsArchiveReason } from '../lib/clientArchiveReasonCore.js'

/**
 * Факт «Причина» в карточке списка архива — только текст, как остальные факты.
 * Правка — иконка-карандаш в ряду действий (`ClientArchiveReasonEditButton`).
 * @param {{ client: object }} props
 */
export function ClientArchiveReasonFact({ client }) {
  if (!client?.archived_at) return null
  const needs = clientNeedsArchiveReason(client)
  const text = formatArchiveReasonDisplay(client)
  return (
    <div className="td-client-fact client-archive-reason-fact">
      <span className="td-client-fact__label">Причина</span>
      <span
        className={`td-client-fact__value${needs ? ' client-archive-reason-fact__value--missing' : ''}`}
        title={text || undefined}
      >
        {text}
      </span>
    </div>
  )
}
