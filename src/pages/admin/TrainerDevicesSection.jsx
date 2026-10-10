import { Check, RefreshCw, Replace, ShieldOff, Smartphone, TabletSmartphone } from 'lucide-react'
import { useMemo } from 'react'
import { formatIsoRu } from '../../lib/period.js'
import { groupTrainerDevices } from '../../lib/admin/trainerDevicesViewCore.js'

function when(iso) {
  return iso ? formatIsoRu(String(iso).slice(0, 10)) : '—'
}

function DeviceIcon({ device }) {
  return device.kind === 'coach' ? (
    <Smartphone size={22} aria-label="Телефон тренера" />
  ) : (
    <TabletSmartphone size={22} aria-hidden />
  )
}

/**
 * @param {{ devices: object[], bindingActive: boolean, busy: boolean, error: string, onReload: () => void, onAct: (id: string, op: 'approve' | 'replace' | 'revoke') => void }} p
 */
export function TrainerDevicesSection({ devices, bindingActive, busy, error, onReload, onAct }) {
  const { pending, trainers } = useMemo(() => groupTrainerDevices(devices), [devices])

  const revoke = (d) => {
    const ok = window.confirm(
      `Отозвать «${d.label || 'устройство'}» у ${d.trainer_name || 'тренера'}?\n` +
        (d.kind === 'coach'
          ? 'Телефон сразу потеряет доступ. Данных клуба на нём не хранится.'
          : 'Вход на нём закончится в течение часа. Неотправленные тренировки останутся на устройстве до повторного разрешения.'),
    )
    if (ok) onAct(d.id, 'revoke')
  }

  return (
    <section className="trainer-devices" aria-label="Устройства тренеров">
      <div className="trainer-devices__toolbar">
        {!bindingActive ? (
          <p className="trainer-devices__note" role="note">
            Привязка ещё не включена на сервере — список копится, вход пока не ограничен.
          </p>
        ) : null}
        <button type="button" className="btn btn-ghost btn-icon-square btn-touch" disabled={busy} onClick={onReload} aria-label="Обновить" title="Обновить">
          <RefreshCw size={18} className={busy ? 'icon-spin' : undefined} aria-hidden />
        </button>
      </div>
      {error ? <p className="sales-report__error">{error}</p> : null}

      <h2 className="section-title">Ждут разрешения{pending.length ? ` · ${pending.length}` : ''}</h2>
      {pending.length === 0 ? (
        <p className="muted">Новых устройств нет.</p>
      ) : (
        <ul className="trainer-devices__list">
          {pending.map((d) => (
            <li key={d.id} className="trainer-devices__row trainer-devices__row--pending">
              <DeviceIcon device={d} />
              <div className="trainer-devices__info">
                <strong>{d.trainer_name || d.trainer_login || 'Тренер'}</strong>
                <span className="muted">
                  {d.label || 'Устройство'} · попытка входа {when(d.created_at)}
                </span>
              </div>
              <div className="trainer-devices__actions">
                <button
                  type="button"
                  className="btn btn-primary btn-touch"
                  disabled={busy}
                  onClick={() => onAct(d.id, 'approve')}
                  title={d.isCoach && d.hasApproved ? 'Прежний телефон тренера отключится' : undefined}
                >
                  <Check size={18} aria-hidden /> Разрешить
                </button>
                {d.hasApproved && !d.isCoach ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-square btn-touch"
                    disabled={busy}
                    onClick={() => onAct(d.id, 'replace')}
                    aria-label="Заменить старое устройство этим"
                    title="Заменить: старое устройство тренера отключится, это — разрешится"
                  >
                    <Replace size={18} aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch"
                  disabled={busy}
                  onClick={() => onAct(d.id, 'revoke')}
                  aria-label="Отклонить"
                  title="Отклонить"
                >
                  <ShieldOff size={18} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Разрешённые</h2>
      {trainers.length === 0 ? (
        <p className="muted">Пока пусто — устройства появятся после первого входа тренеров.</p>
      ) : (
        <ul className="trainer-devices__list">
          {trainers.map((t) =>
            t.devices.map((d, i) => (
              <li key={d.id} className="trainer-devices__row">
                <DeviceIcon device={d} />
                <div className="trainer-devices__info">
                  <strong>{i === 0 ? t.name : ''}</strong>
                  <span className="muted">
                    {d.label || 'Устройство'} · был в сети {when(d.last_seen_at || d.created_at)}
                    {t.devices.filter((x) => x.kind !== 'coach').length > 1 && d.kind !== 'coach' ? ' · у тренера несколько планшетов' : ''}
                  </span>
                </div>
                <div className="trainer-devices__actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-square btn-touch"
                    disabled={busy}
                    onClick={() => revoke(d)}
                    aria-label="Отозвать устройство"
                    title="Отозвать устройство"
                  >
                    <ShieldOff size={18} aria-hidden />
                  </button>
                </div>
              </li>
            )),
          )}
        </ul>
      )}
    </section>
  )
}
