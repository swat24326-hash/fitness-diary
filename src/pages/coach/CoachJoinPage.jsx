import { useCallback, useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import { CoachPendingError, clearSavedCoachQr, redeemCoachQr } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachPendingScreen } from './CoachPendingScreen.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachStatus } from './CoachStatus.jsx'

/** Вход по QR с планшета тренера. Новый телефон ждёт «Разрешить»; код помним, пока ждём (можно закрыть браузер). */
export function CoachJoinPage({ token, onUsePassword }) {
  const { onSignedIn } = useCoachApp()
  const [phase, setPhase] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const attempt = useCallback(
    async (quiet) => {
      if (!quiet) setBusy(true)
      try {
        await redeemCoachQr(token)
        onSignedIn()
      } catch (e) {
        if (e instanceof CoachPendingError) {
          setError('')
          setPhase('pending')
        } else {
          setError(e?.message || 'Не удалось войти')
          setPhase((p) => (p === 'pending' && quiet ? p : 'error'))
        }
      } finally {
        if (!quiet) setBusy(false)
      }
    },
    [token, onSignedIn],
  )

  useEffect(() => {
    void attempt(false)
  }, [attempt])

  const usePassword = () => {
    clearSavedCoachQr()
    onUsePassword()
  }
  const passwordButton = (
    <button type="button" className="btn btn-ghost btn-touch" onClick={usePassword}>
      Войти по логину и паролю
    </button>
  )

  if (phase === 'pending') {
    return (
      <CoachPendingScreen busy={busy} error={error} onRetry={attempt}>
        {passwordButton}
      </CoachPendingScreen>
    )
  }

  return (
    <CoachShell tabs={false}>
      <CoachStatus
        icon={QrCode}
        title={phase === 'error' ? 'Не получилось войти по QR' : 'Входим по QR…'}
        hint={phase === 'error' ? error : 'Проверяем код с планшета'}
      >
        {phase === 'error' ? (
          <>
            <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={() => void attempt(false)}>
              Попробовать ещё раз
            </button>
            {passwordButton}
          </>
        ) : null}
      </CoachStatus>
    </CoachShell>
  )
}
