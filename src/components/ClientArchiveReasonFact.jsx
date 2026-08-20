import {
  formatArchiveReasonDisplay,
  clientNeedsArchiveReason,
} from '../lib/clientArchiveReasonCore.js'
import { formatExpectedReturnHint } from '../lib/clientArchiveExpectedReturnCore.js'

/**
 * Факт «Причина» в карточке списка архива — бейдж в стиле карточки.
 * Правка — иконка-карандаш в ряду действий (`ClientArchiveReasonEditButton`).
 * @param {{ client: object }} props
 */
export function ClientArchiveReasonFact({ client }) {
  if (!client?.archived_at) return null
  const needs = clientNeedsArchiveReason(client)
  const text = formatArchiveReasonDisplay(client)
  const returnHint = formatExpectedReturnHint(client)
  return (
    <div className="td-client-fact client-archive-reason-fact">
      <span className="td-client-fact__label">Причина</span>
      <span className="td-client-fact__value td-client-fact__value--archive-reason">
        <span
          className={`client-archive-reason-badge${needs ? ' client-archive-reason-badge--missing' : ''}`}
          title={[text, returnHint].filter(Boolean).join(' · ') || undefined}
        >
          {text}
        </span>
        {returnHint ? (
          <span
            className={`client-archive-return-hint${returnHint.includes('прошёл') ? ' client-archive-return-hint--due' : ''}`}
          >
            {returnHint}
          </span>
        ) : null}
      </span>
    </div>
  )
}
