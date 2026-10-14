import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { formatBuildAgeRu } from '../../lib/appBuildInfo.js'
import { DEVICE_HEALTH_CODES } from '../../lib/deviceHealth/deviceHealthCatalog.js'
import { deviceCodeTitle, deviceHealthMessageHref } from '../../lib/admin/deviceHealthViewCore.js'

/** Одна карточка «требует внимания»: что сломалось, что сказать тренеру, действия. */
export function DeviceHealthCard({ device, busy, onResolve }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(device.instruction)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <li className={`device-health-card${device.critical ? ' device-health-card--critical' : ''}`} data-testid="device-health-card">
      <div className="device-health-card__head">
        <strong>{device.trainer_name || 'Тренер'}</strong>
        <span className="muted">
          {[device.club_name, device.label].filter(Boolean).join(' · ')}
        </span>
      </div>
      <ul className="device-health-card__codes">
        {device.codes.map((c) => (
          <li key={c} className={`device-health-chip${DEVICE_HEALTH_CODES[c]?.critical ? ' device-health-chip--critical' : ''}`}>
            {deviceCodeTitle(c)}
          </li>
        ))}
      </ul>
      <p className="device-health-card__meta muted">
        {device.problem_since ? `Сбой ${formatBuildAgeRu(device.problem_since)}` : null}
        {device.last_report_at ? ` · планшет на связи ${formatBuildAgeRu(device.last_report_at)}` : null}
        {device.queue_count > 0 ? ` · не отправлено записей: ${device.queue_count}` : null}
      </p>
      <div className="device-health-card__say">
        <span className="device-health-card__say-label">Скажите тренеру</span>
        <p>{device.instruction}</p>
      </div>
      <div className="device-health-card__actions">
        <Link className="btn btn-primary btn-sm" to={deviceHealthMessageHref(device)}>
          <MessageCircle size={16} aria-hidden /> Написать тренеру
        </Link>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
          <Copy size={16} aria-hidden /> {copied ? 'Скопировано' : 'Скопировать'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onResolve(device.id)}>
          <Check size={16} aria-hidden /> Решено
        </button>
      </div>
    </li>
  )
}
