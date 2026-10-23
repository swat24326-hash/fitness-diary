import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { formatBuildAgeRu } from '../../lib/appBuildInfo.js'
import { DEVICE_HEALTH_CODES } from '../../lib/deviceHealth/deviceHealthCatalog.js'
import { deviceCodeTitle, deviceHealthMessageHref } from '../../lib/admin/deviceHealthViewCore.js'

function trainerName(device) {
  return device.trainer_name || 'Тренер'
}

function tabletsWord(count) {
  const n10 = count % 10
  const n100 = count % 100
  if (n10 === 1 && n100 !== 11) return 'планшет'
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'планшета'
  return 'планшетов'
}

/** Несколько планшетов с одним отказом: текст один раз, написать и «Решено» — у каждого. */
export function DeviceHealthGroupCard({ devices, busyId, onResolve }) {
  const [copied, setCopied] = useState(false)
  const lead = devices[0]
  const critical = devices.some((device) => device.critical)
  const since = devices.reduce((earliest, device) => {
    const t = Date.parse(device.problem_since ?? '')
    if (!Number.isFinite(t)) return earliest
    return earliest == null || t < earliest ? t : earliest
  }, null)
  const people = [...devices].sort((a, b) => trainerName(a).localeCompare(trainerName(b), 'ru'))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lead.instruction)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <li className={`device-health-card${critical ? ' device-health-card--critical' : ''}`} data-testid="device-health-card">
      <div className="device-health-card__head">
        <strong>Один отказ · {devices.length} {tabletsWord(devices.length)}</strong>
      </div>
      <ul className="device-health-card__codes">
        {lead.codes.map((code) => (
          <li key={code} className={`device-health-chip${DEVICE_HEALTH_CODES[code]?.critical ? ' device-health-chip--critical' : ''}`}>
            {deviceCodeTitle(code)}
          </li>
        ))}
      </ul>
      {lead.queue_lines?.length ? (
        <div className="device-health-card__queue" data-testid="device-health-queue">
          <span className="device-health-card__say-label">Не уходит с планшета</span>
          <ul>
            {lead.queue_lines.map((line, i) => (
              <li key={`${line.text}-${i}`}>{line.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="device-health-card__meta muted">
        {since != null ? `Сбой ${formatBuildAgeRu(new Date(since).toISOString())}` : null}
        {` · планшетов: ${devices.length}`}
      </p>
      <ul className="device-health-card__people">
        {people.map((device) => (
          <li key={device.id} className="device-health-card__person">
            <span>
              <strong>{trainerName(device)}</strong>
              <span className="muted">{[device.club_name, device.label].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="device-health-card__actions">
              <Link className="btn btn-primary btn-sm" to={deviceHealthMessageHref(device)}>
                <MessageCircle size={16} aria-hidden /> Написать
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busyId === device.id}
                onClick={() => onResolve(device.id)}
              >
                <Check size={16} aria-hidden /> Решено
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="device-health-card__say">
        <span className="device-health-card__say-label">Скажите тренеру</span>
        <p>{lead.instruction}</p>
      </div>
      <div className="device-health-card__actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
          <Copy size={16} aria-hidden /> {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
    </li>
  )
}
