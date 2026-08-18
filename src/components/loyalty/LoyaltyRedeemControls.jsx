import { useEffect, useState } from 'react'
import { isAppOnline } from '../../lib/networkReachability.js'
import { redeemLoyaltyAccount } from '../../lib/loyalty/loyaltyGlanceService.js'
import {
  LOYALTY_REDEEM_COMMENT_MAX,
  buildLoyaltyRedeemBody,
  loyaltyRedeemButtonState,
  loyaltyRedeemConfirmText,
  loyaltyRedeemErrorText,
} from '../../lib/loyalty/loyaltyRedeemUiCore.js'

function useBrowserOnline() {
  const [online, setOnline] = useState(() => isAppOnline())
  useEffect(() => {
    const sync = () => setOnline(isAppOnline())
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  return online
}

/**
 * Кнопка списать на вкладке «Баллы». Тренер / управляющий не видят.
 */
export function LoyaltyRedeemControls({ clientId, snapshot, role, onDone }) {
  const online = useBrowserOnline()
  const [comment, setComment] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const btn = loyaltyRedeemButtonState({ role, online, snapshot, busy })
  if (!btn.show) return null

  const body = buildLoyaltyRedeemBody({ clientId, snapshot, comment })
  const confirmText = loyaltyRedeemConfirmText(snapshot?.points)

  async function redeem() {
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await redeemLoyaltyAccount({
        clientId: body.client_id,
        expectedPoints: body.expected_points,
        comment: body.comment,
      })
      setComment('')
      setConfirmOpen(false)
      setOkMsg('Баллы списаны.')
      onDone?.()
    } catch (e) {
      setError(loyaltyRedeemErrorText(e))
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="loyalty-redeem">
      <label className="loyalty-redeem__comment">
        Комментарий к подарку
        <input
          className="input"
          value={comment}
          maxLength={LOYALTY_REDEEM_COMMENT_MAX}
          disabled={btn.disabled && !confirmOpen}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Необязательно"
        />
      </label>

      {confirmOpen ? (
        <div className="loyalty-redeem__confirm" role="alertdialog" aria-label="Подтверждение списания">
          <p>{confirmText}</p>
          <div className="loyalty-redeem__actions">
            <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Отмена
            </button>
            <button type="button" className="btn btn-primary btn-touch" disabled={busy} onClick={() => void redeem()}>
              {busy ? 'Списываю…' : 'Списать'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-touch"
          disabled={btn.disabled}
          title={btn.reason || 'Списать все баллы'}
          onClick={() => setConfirmOpen(true)}
        >
          Списать все
        </button>
      )}

      {btn.reason ? (
        <p className="muted loyalty-redeem__reason" role="status">
          {btn.reason}
        </p>
      ) : null}
      {error ? (
        <p className="loyalty-redeem__error" role="alert">
          {error}
        </p>
      ) : null}
      {okMsg ? (
        <p className="loyalty-redeem__ok" role="status">
          {okMsg}
        </p>
      ) : null}
    </div>
  )
}
