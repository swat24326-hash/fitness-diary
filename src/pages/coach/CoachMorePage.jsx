import { Bell, BellOff, LogOut } from 'lucide-react'
import { fetchCoachMe } from '../../lib/coach/coachApiClient.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { useCoachLoad } from './useCoachLoad.js'
import { useCoachPush } from './useCoachPush.js'

const PUSH_HINT = {
  install_first: 'На iPhone уведомления приходят только приложению со значка: «Поделиться» → «На экран Домой», затем откройте значок.',
  denied: 'Уведомления запрещены в настройках браузера — разрешите их для этого сайта.',
  none: 'Уведомления на этом телефоне недоступны.',
}

/** «Ещё»: уведомления о сообщениях и выход. Данных клуба на телефоне нет — выход ничего не теряет. */
export function CoachMorePage() {
  const { signOut } = useCoachApp()
  const me = useCoachLoad(fetchCoachMe)
  const push = useCoachPush()
  const on = push.mode === 'on'
  const canToggle = on || push.mode === 'off'

  return (
    <CoachShell title="Ещё">
      <section className="coach-card">
        <strong>{me.data?.name || 'Тренер'}</strong>
        <p className="muted">Расписание и клиенты правятся на планшете. На телефоне — ответы клиентам и план дня.</p>
      </section>
      <section className="coach-card coach-push">
        <div className="coach-push__row">
          {on ? <Bell size={20} aria-hidden /> : <BellOff size={20} aria-hidden />}
          <span>Уведомления о сообщениях</span>
          {canToggle ? (
            <button
              type="button"
              className={`btn btn-touch ${on ? 'btn-secondary' : 'btn-primary'}`}
              disabled={push.busy || !push.ready}
              onClick={() => void (on ? push.disable() : push.enable())}
            >
              {on ? 'Выключить' : 'Включить'}
            </button>
          ) : null}
        </div>
        {!canToggle && push.ready ? <p className="muted">{PUSH_HINT[push.mode] ?? PUSH_HINT.none}</p> : null}
        {push.error ? <p className="coach-form__error" role="alert">{push.error}</p> : null}
      </section>
      <button type="button" className="btn btn-ghost btn-touch coach-signout" onClick={() => void signOut()}>
        <LogOut size={18} aria-hidden /> Выйти
      </button>
    </CoachShell>
  )
}
