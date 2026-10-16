import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { OfferLink } from './OfferLink.jsx'
import {
  OFFER_VERSION,
  hasAcceptedCurrentOffer,
  offerGateLeadRu,
  offerSections,
  staffNeedsOfferAccept,
} from '../../lib/legal/offerCore.js'
import { postMyProfile } from '../../lib/profileApiClient.js'
import { PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'

/**
 * Управляющий без принятой оферты — полный экран до работы в клубе.
 * Админ / тренер / менеджер — пропускаем.
 * Пока профиль грузится — не мигаем офертой (уже принявший не увидит вспышку).
 * Класс app-shell--admin — champagne accent роли (без layout оболочки).
 */
export function SupervisorOfferGate({ children }) {
  const { user, role, refreshUserProfile, profilePending } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (role !== 'supervisor') return children
  if (profilePending) {
    return (
      <div
        className="app-shell--admin offer-gate offer-gate--loading"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="offer-gate__loading muted">Проверяем условия доступа…</p>
      </div>
    )
  }

  const needs = staffNeedsOfferAccept(role, user)
  if (!needs) return children

  async function accept() {
    if (!checked || busy) return
    setBusy(true)
    setError('')
    try {
      await postMyProfile({ action: 'offer-accept', version: OFFER_VERSION })
      const profile = await refreshUserProfile()
      if (!hasAcceptedCurrentOffer(profile)) {
        setError('Сохранено на сервере — обновите страницу, если окно не закрылось')
        setBusy(false)
      }
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось сохранить — попробуйте ещё раз')
      setBusy(false)
    }
  }

  return (
    <div
      className="app-shell--admin offer-gate os-enter"
      role="dialog"
      aria-labelledby="offer-gate-title"
      aria-describedby="offer-gate-lead"
      aria-modal="true"
    >
      <div className="offer-gate__card">
        <header className="offer-gate__header">
          <p className="offer-gate__brand">{PRODUCT_BRAND_NAME}</p>
          <h1 id="offer-gate-title" className="offer-gate__title">
            Условия доступа
          </h1>
          <p id="offer-gate-lead" className="offer-gate__lead">
            {offerGateLeadRu(OFFER_VERSION)}
          </p>
        </header>

        <div className="offer-gate__scroll" tabIndex={0}>
          {offerSections().map((s) => (
            <section key={s.id} className="offer-gate__section">
              <h2 className="offer-gate__h2">{s.title}</h2>
              <p className="offer-gate__body">{s.body}</p>
            </section>
          ))}
        </div>

        <footer className="offer-gate__footer">
          <label className="offer-gate__check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={busy}
            />
            <span>Ознакомился с офертой и принимаю её от имени клуба</span>
          </label>
          {error ? (
            <p className="offer-gate__error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-touch offer-gate__btn"
            disabled={!checked || busy}
            onClick={() => void accept()}
          >
            {busy ? 'Сохраняем…' : 'Принимаю и продолжаю'}
          </button>
          <p className="offer-gate__full muted">
            <OfferLink>Открыть полный текст оферты</OfferLink>
          </p>
        </footer>
      </div>
    </div>
  )
}
