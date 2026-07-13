import { AlertTriangle } from 'lucide-react'

/**
 * @param {{
 *   alerts: Array<{ id: string, severity?: string, title: string, message: string, handlerId?: string, ctaMessage?: string }>,
 *   disabled?: boolean,
 *   onAlertAction?: (alert: object) => void,
 * }} props
 */
export function IskraAlertRibbon({ alerts, disabled = false, onAlertAction }) {
  if (!alerts?.length) return null

  return (
    <div className="iskra-alert-ribbon" role="region" aria-label="Сигналы ИСКРЫ">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`iskra-alert-ribbon__item iskra-alert-ribbon__item--${alert.severity ?? 'accent'}`}
        >
          <AlertTriangle size={14} aria-hidden className="iskra-alert-ribbon__icon" />
          <div className="iskra-alert-ribbon__copy">
            <strong>{alert.title}</strong>
            <p className="muted">{alert.message}</p>
          </div>
          {alert.handlerId && onAlertAction ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled}
              onClick={() => onAlertAction(alert)}
            >
              Разобрать
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
