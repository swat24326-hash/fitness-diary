import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Volume2 } from 'lucide-react'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { useChatSoundSetting } from '../../hooks/useChatSoundSetting.js'
import {
  CYCLE_SEX_BLOCKED_RU,
  clientCanConfigureCycle,
  publicClientCycle,
} from '../../lib/client/clientCycleCalendarCore.js'
import { disableClientCycle, upsertClientCycle } from '../../lib/client/clientCycleService.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientCycleSettingsSheet } from './ClientCycleSettingsSheet.jsx'

const REMINDER_HINT = {
  install_first: 'На iPhone напоминания работают только в приложении со значка на экране «Домой». Установите его через меню.',
  denied: 'Уведомления запрещены в настройках телефона. Разрешите их для этого приложения и откройте его снова.',
  none: 'Напоминания пока недоступны на этом телефоне.',
}

/**
 * Настройки клиента: напоминания, звуки, цикл, ссылки политики — в «Мой профиль» (☰).
 * @param {{
 *   asOf?: string
 *   sex?: 'male'|'female'|null
 *   cycle?: object|null
 *   onCycleChange?: (cycle: object) => void
 *   openCycleRequest?: number
 * }} props
 */
export function ClientSettingsSection({
  asOf = '',
  sex = null,
  cycle = null,
  onCycleChange = null,
  openCycleRequest = 0,
}) {
  const { push } = useClientApp()
  const sound = useChatSoundSetting('client')
  const on = push.mode === 'on'
  const canToggle = on || push.mode === 'off'
  const pub = publicClientCycle(cycle)
  const canCycle = clientCanConfigureCycle(sex)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (openCycleRequest > 0) {
      setError('')
      setSheetOpen(true)
    }
  }, [openCycleRequest])

  const openSheet = () => {
    setError('')
    setSheetOpen(true)
  }

  const toggleCycle = async () => {
    if (!canCycle && !pub.enabled) {
      setError(CYCLE_SEX_BLOCKED_RU)
      return
    }
    if (pub.enabled) {
      setBusy(true)
      setError('')
      try {
        const res = await disableClientCycle()
        onCycleChange?.(res.cycle ?? { enabled: false })
      } catch (e) {
        setError(e?.message || 'Не удалось выключить')
      } finally {
        setBusy(false)
      }
      return
    }
    openSheet()
  }

  return (
    <>
      <section className="client-me-card">
        <div className="client-settings__row">
          <span className="client-settings__label">
            <Bell size={18} aria-hidden />
            <span>
              Напоминания о тренировках
              <small className="client-me-muted">Накануне в 19:00</small>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Напоминания о тренировках"
            className={`client-switch${on ? ' client-switch--on' : ''}`}
            disabled={!canToggle || push.busy}
            onClick={() => void (on ? push.disable() : push.enable())}
          >
            <span className="client-switch__knob" />
          </button>
        </div>
        {canToggle || !push.ready ? null : <p className="client-me-muted">{REMINDER_HINT[push.mode] ?? REMINDER_HINT.none}</p>}
        {push.error ? (
          <p className="client-onb__error" role="alert">
            {push.error}
          </p>
        ) : null}
      </section>
      <section className="client-me-card">
        <div className="client-settings__row">
          <span className="client-settings__label">
            <Volume2 size={18} aria-hidden />
            <span>
              Звуки сообщений
              <small className="client-me-muted">Пока приложение открыто</small>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sound.on}
            aria-label="Звуки сообщений"
            className={`client-switch${sound.on ? ' client-switch--on' : ''}`}
            onClick={sound.toggle}
          >
            <span className="client-switch__knob" />
          </button>
        </div>
      </section>
      <section className="client-me-card">
        <div className="client-settings__row">
          <span className="client-settings__label">
            <CalendarDays size={18} aria-hidden />
            <span>
              Отмечать цикл
              <small className="client-me-muted">
                {canCycle ? 'Только вы · в календаре тренировок' : CYCLE_SEX_BLOCKED_RU}
              </small>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pub.enabled}
            aria-label="Отмечать цикл"
            title={!canCycle && !pub.enabled ? CYCLE_SEX_BLOCKED_RU : undefined}
            className={`client-switch${pub.enabled ? ' client-switch--on' : ''}${!canCycle && !pub.enabled ? ' client-switch--muted' : ''}`}
            disabled={busy || !asOf || (!canCycle && !pub.enabled)}
            onClick={() => void toggleCycle()}
          >
            <span className="client-switch__knob" />
          </button>
        </div>
        {pub.enabled && canCycle ? (
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy || !asOf} onClick={openSheet}>
            Параметры цикла
          </button>
        ) : null}
        {error ? (
          <p className="client-onb__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <LegalEntryLinks className="legal-entry-links--in-profile" />
      {sheetOpen && asOf ? (
        <ClientCycleSettingsSheet
          asOf={asOf}
          sex={sex}
          initial={cycle}
          busy={busy}
          error={error}
          onClose={() => !busy && setSheetOpen(false)}
          onSave={async (payload) => {
            setBusy(true)
            setError('')
            try {
              const res = await upsertClientCycle(payload)
              onCycleChange?.(res.cycle ?? { enabled: true, ...payload })
              setSheetOpen(false)
            } catch (e) {
              setError(e?.message || 'Не удалось сохранить')
            } finally {
              setBusy(false)
            }
          }}
          onDisable={async () => {
            setBusy(true)
            setError('')
            try {
              const res = await disableClientCycle()
              onCycleChange?.(res.cycle ?? { enabled: false })
              setSheetOpen(false)
            } catch (e) {
              setError(e?.message || 'Не удалось выключить')
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </>
  )
}
