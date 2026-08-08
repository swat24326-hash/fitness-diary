/**
 * Модалка: кабинет тренера — план / без плана + ±₽ к ставке.
 */

import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import {
  defaultTrainerPayProfile,
  normalizeTrainerPayProfile,
  validateTrainerPayProfileForSave,
} from '../../lib/admin/trainerPayProfileCore.js'
import {
  fetchTrainerPayProfile,
  saveTrainerPayProfile,
} from '../../lib/admin/trainerPayProfileSettingsService.js'

/**
 * @param {{
 *   trainer: { id?: string, name?: string | null } | null,
 *   clubId: string,
 *   open: boolean,
 *   onClose: () => void,
 *   onSaved?: () => void,
 * }} props
 */
export function AdminTrainerPayOfficeModal({ trainer, clubId, open, onClose, onSaved }) {
  const trainerId = String(trainer?.id ?? '').trim()
  const cid = String(clubId ?? '').trim()
  const [onPlan, setOnPlan] = useState(true)
  const [adjDraft, setAdjDraft] = useState('0')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  useEffect(() => {
    if (!open || !trainerId || !cid) return
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const data = await fetchTrainerPayProfile(cid, trainerId)
        if (cancelled) return
        const p = data.profile
        setOnPlan(p.on_plan !== false)
        setAdjDraft(String(p.rate_adjustment_rub ?? 0))
        setMigrationNeeded(Boolean(data.migration_needed))
      } catch (e) {
        if (!cancelled) setError(e?.message ? String(e.message) : 'Не удалось загрузить кабинет')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, trainerId, cid])

  const draftCheck = useMemo(
    () =>
      validateTrainerPayProfileForSave({
        trainer_id: trainerId,
        club_id: cid,
        on_plan: onPlan,
        rate_adjustment_rub: adjDraft,
      }),
    [trainerId, cid, onPlan, adjDraft],
  )

  if (!open || !trainerId) return null

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!draftCheck.ok) return
    setBusy(true)
    setError('')
    try {
      await saveTrainerPayProfile(draftCheck.profile)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err?.message ? String(err.message) : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const exampleBase = 500
  const adjNum = draftCheck.ok ? draftCheck.profile.rate_adjustment_rub : Number(adjDraft) || 0
  const exampleEff = Math.max(0, Math.round((exampleBase + adjNum) * 100) / 100)

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trainer-pay-office-title"
      onClick={onClose}
    >
      <div className="modal-panel admin-trainer-pay-office" onClick={(e) => e.stopPropagation()}>
        <h2 id="trainer-pay-office-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
          <Wallet size={20} aria-hidden style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Кабинет тренера
        </h2>
        <p className="muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
          <strong>{trainer?.name ?? 'Тренер'}</strong>. План — уровни по числу тренировок месяца (пороги в «План
          ЗП»). Без плана — всегда уровень 3. Надбавка/минус — к ставке <em>каждой</em> тренировки.
        </p>

        {migrationNeeded ? (
          <p className="admin-section__banner admin-section__banner--warn">
            Таблица кабинетов ещё не создана — примените миграцию <code>trainer_pay_profiles</code>.
          </p>
        ) : null}

        {loading ? <p className="muted">Загрузка…</p> : null}

        <form className="grid td-modal-form" onSubmit={onSubmit} style={{ gap: 14 }}>
          <fieldset className="admin-trainer-pay-office__plan" disabled={busy || loading}>
            <legend className="label">Режим</legend>
            <label className="admin-trainer-pay-office__radio">
              <input
                type="radio"
                name="on_plan"
                checked={onPlan}
                onChange={() => setOnPlan(true)}
              />
              С планом (уровни 1–3 по тренировкам)
            </label>
            <label className="admin-trainer-pay-office__radio">
              <input
                type="radio"
                name="on_plan"
                checked={!onPlan}
                onChange={() => setOnPlan(false)}
              />
              Без плана (всегда уровень 3)
            </label>
          </fieldset>

          <div className="field">
            <label className="label" htmlFor="trainer-pay-adj">
              Надбавка / минус за тренировку (₽)
            </label>
            <input
              id="trainer-pay-adj"
              className="input"
              type="text"
              inputMode="decimal"
              value={adjDraft}
              disabled={busy || loading}
              onChange={(e) => setAdjDraft(e.target.value)}
              placeholder="0 или −50 или 100"
            />
            <p className="muted admin-trainer-pay-office__hint">
              Пример: VIP {exampleBase} ₽ {adjNum >= 0 ? '+' : ''}
              {adjNum} → <strong>{exampleEff} ₽</strong> за тренировку (не ниже 0).
            </p>
          </div>

          {!draftCheck.ok ? (
            <p className="muted" style={{ color: 'var(--danger, #f87171)', margin: 0 }}>
              {draftCheck.error}
            </p>
          ) : null}
          {error ? (
            <p className="muted" style={{ color: 'var(--danger, #f87171)', margin: 0 }}>
              {error}
            </p>
          ) : null}

          <div className="row td-modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-touch"
              disabled={busy || loading || !draftCheck.ok || migrationNeeded}
            >
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Для тестов / сброса черновика */
export function emptyPayOfficeDraft(trainerId, clubId) {
  return normalizeTrainerPayProfile(defaultTrainerPayProfile(trainerId, clubId))
}
