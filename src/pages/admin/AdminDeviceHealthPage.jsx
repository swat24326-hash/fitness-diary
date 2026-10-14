import { useState } from 'react'
import { MonitorSmartphone, RefreshCw } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { useDeviceHealthList } from '../../hooks/useDeviceHealth.js'
import { formatBuildAgeRu } from '../../lib/appBuildInfo.js'
import { deviceCodeTitle, splitDeviceHealth } from '../../lib/admin/deviceHealthViewCore.js'
import { AdminDiagnostics } from './AdminDiagnostics.jsx'
import { DeviceHealthCard } from './DeviceHealthCard.jsx'

/** /admin/health — центр сбоев: какие планшеты тренеров сейчас не в порядке и что сказать тренеру. */
export function AdminDeviceHealthPage() {
  const { devices, error, busyId, reload, resolve } = useDeviceHealthList()
  const [selfOpen, setSelfOpen] = useState(false)
  const { attention, all } = splitDeviceHealth(devices)
  return (
    <section className="admin-section-shell device-health">
      <AdminSectionHeader
        icon={MonitorSmartphone}
        title="Сбои устройств"
        lead="Планшеты тренеров сами сообщают о серьёзных сбоях. Новый сбой — push сюда; повтор не чаще раза в 2 часа, пока не нажмёте «Решено»."
      >
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={16} aria-hidden /> Обновить
        </button>
      </AdminSectionHeader>

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      <h2 className="device-health__title">Требуют внимания</h2>
      {devices == null && !error ? <p className="muted">Загружаем…</p> : null}
      {devices && !attention.length ? (
        <p className="device-health__ok" data-testid="device-health-ok">
          Все планшеты в порядке.
        </p>
      ) : null}
      {attention.length ? (
        <ul className="device-health__cards">
          {attention.map((d) => (
            <DeviceHealthCard key={d.id} device={d} busy={busyId === d.id} onResolve={(id) => void resolve(id)} />
          ))}
        </ul>
      ) : null}

      {all.length ? (
        <>
          <h2 className="device-health__title">Все устройства · {all.length}</h2>
          <ul className="device-health__list">
            {all.map((d) => (
              <li key={d.id} className="device-health__row">
                <span className="device-health__row-name">
                  <strong>{d.trainer_name || 'Тренер'}</strong>
                  <span className="muted">{[d.club_name, d.label].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={d.codes.length ? 'device-health__row-state--bad' : 'device-health__row-state--ok'}>
                  {d.codes.length ? d.codes.map(deviceCodeTitle).join('; ') : 'В порядке'}
                </span>
                <span className="muted device-health__row-meta">
                  {d.last_report_at ? `на связи ${formatBuildAgeRu(d.last_report_at)}` : '—'}
                  {d.bundle_id ? ` · сборка ${d.bundle_id}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <details className="device-health__self" onToggle={(e) => setSelfOpen(e.currentTarget.open)}>
        <summary>Это устройство — журнал ошибок, очередь, отчёт для разработчика</summary>
        {selfOpen ? <AdminDiagnostics /> : null}
      </details>
    </section>
  )
}
