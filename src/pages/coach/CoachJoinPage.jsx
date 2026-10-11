import { useCallback, useEffect, useState } from 'react'
import { QrCode, Smartphone } from 'lucide-react'
import { CoachPendingError, clearSavedCoachQr, redeemCoachHandoff, redeemCoachQr } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachPendingScreen } from './CoachPendingScreen.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachStatus } from './CoachStatus.jsx'

const COPY = {
  qr: { icon: QrCode, loading: 'Входим по QR…', hint: 'Проверяем код с планшета', failed: 'Не получилось войти по QR' },
  handoff: { icon: Smartphone, loading: 'Входим…', hint: 'Значок переносит вход из Safari', failed: 'Не получилось войти' },
}

/**
 * Вход без пароля: QR с планшета (новый телефон ждёт «Разрешить»; код помним, пока ждём)
 * или первый запуск значка «Домой» на iPhone (телефон уже разрешён в Safari).
 */
export function CoachJoinPage({ kind = 'qr', token, onUsePassword }) {
  const { onSignedIn } = useCoachApp()
  const [phase, setPhase] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copy = COPY[kind] || COPY.qr

  const attempt = useCallback(
    async (quiet) => {
      if (!quiet) setBusy(true)
      try {
        await (kind === 'handoff' ? redeemCoachHandoff(token) : redeemCoachQr(token))
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
    [kind, token, onSignedIn],
  )

  useEffect(() => {
    void attempt(false)
  }, [attempt])

  const usePassword = () => {
    if (kind === 'qr') clearSavedCoachQr()
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
        icon={copy.icon}
        title={phase === 'error' ? copy.failed : copy.loading}
        hint={phase === 'error' ? error : copy.hint}
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
