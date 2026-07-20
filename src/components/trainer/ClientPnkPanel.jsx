import { useEffect, useRef, useState } from 'react'
import { Ban, CalendarClock, Trophy, Dumbbell } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  buildPnkAttentionFlags,
  isOpenPnkClient,
  parsePnkDeliverables,
  resolvePnkTrainerUiStep,
} from '../../lib/pnk/pnkStagesCore'
import { canAdvancePnkWizardStep } from '../../lib/pnk/pnkWizardCore'
import { resolvePnkFunnelHatNav } from '../../lib/pnk/pnkWizardNavCore'
import { hasPaidDkMembership } from '../../lib/pnk/pnkTrialTrainingCore'
import { patchPnkClientLocal, refuseAndDeletePnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { listMemberships } from '../../lib/dataAccess'
import { ensureMembershipTypesForClub } from '../../lib/membershipTypesService'
import { PnkClientMessengerButtons } from '../pnk/PnkClientMessengerButtons'
import { PnkFunnelHat } from '../pnk/PnkFunnelHat'
import { PnkAttentionChips } from '../pnk/PnkStatusChips'
import '../../styles/pnk-funnel.css'

/**
 * Линейный мастер ПНК у тренера: шапка с одной главной CTA + тело шага.
 */
export function ClientPnkPanel({
  client,
  onUpdated,
  onRefused,
  onOpenDiaries,
  onStartTraining,
  onOpenTab,
  healthCard,
  bzCompletedCount = 0,
}) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [trialDate, setTrialDate] = useState('')
  const [trialTime, setTrialTime] = useState('')
  const [comment, setComment] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [startBusy, setStartBusy] = useState(false)
  const [hasDkMembership, setHasDkMembership] = useState(false)
  const [advanceLocked, setAdvanceLocked] = useState(false)
  const [confirmRefuse, setConfirmRefuse] = useState(false)
  const autoStartTrainRef = useRef('')
  const advanceLockRef = useRef(false)

  useEffect(() => {
    setTrialDate(String(client?.pnk_trial_date ?? '').slice(0, 10))
    setTrialTime(String(client?.pnk_trial_time ?? ''))
  }, [client?.id, client?.pnk_trial_date, client?.pnk_trial_time])

  const openPnk = Boolean(client && isOpenPnkClient(client))
  const ctx = openPnk
    ? {
        healthCard,
        bzCompletedCount: Math.min(2, Math.max(0, Number(bzCompletedCount) || 0)),
        trialDate,
        trialTime,
      }
    : null
  const step = openPnk ? resolvePnkTrainerUiStep(client, ctx) : null
  const hatNav = openPnk && step ? resolvePnkFunnelHatNav(client, step, ctx) : null

  useEffect(() => {
    if (step?.key !== 'close' || !client?.id || !client?.club_id) {
      setHasDkMembership(false)
      return
    }
    let cancelled = false
    async function refreshDk() {
      try {
        const ms = await listMemberships(client.id)
        const { types } = await ensureMembershipTypesForClub(client.club_id)
        if (!cancelled) setHasDkMembership(hasPaidDkMembership(ms, types))
      } catch {
        if (!cancelled) setHasDkMembership(false)
      }
    }
    void refreshDk()
    const timer = window.setInterval(() => void refreshDk(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [step?.key, client?.id, client?.club_id])

  useEffect(() => {
    if (!step || (step.key !== 'train1' && step.key !== 'train2')) return
    if (typeof onStartTraining !== 'function') return
    const need = step.key === 'train2' ? 2 : 1
    if ((Number(bzCompletedCount) || 0) >= need) return
    const stamp = `${client?.id}:${step.key}`
    if (autoStartTrainRef.current === stamp) return
    autoStartTrainRef.current = stamp
    void onStartTraining()
  }, [step?.key, client?.id, bzCompletedCount, onStartTraining])

  if (!openPnk || !step || !hatNav) return null

  const advance = canAdvancePnkWizardStep(client, step, ctx)
  const flags = buildPnkAttentionFlags(client)
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const trainerName = user?.name || ''
  const primaryInBody = hatNav.primarySlot === 'body'

  async function run(patch) {
    if (!patch) return false
    setBusy(true)
    setError('')
    try {
      const res = await patchPnkClientLocal(client, patch)
      if (!res.ok) {
        setError(res.error || 'Ошибка')
        return false
      }
      onUpdated?.(res.client)
      return true
    } catch (e) {
      setError(String(e?.message ?? e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleRefuseConfirm() {
    setBusy(true)
    setError('')
    try {
      const res = await refuseAndDeletePnkClientLocal(client, {
        lost_reason: lostReason || comment || 'Отказ',
      })
      if (!res.ok) {
        setError(res.error || 'Не удалось оформить отказ')
        setConfirmRefuse(false)
        return
      }
      setConfirmRefuse(false)
      onRefused?.(res)
    } catch (e) {
      setError(String(e?.message ?? e))
      setConfirmRefuse(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleHatNext() {
    if (advanceLockRef.current) return
    const patch = hatNav.nextPatch
    if (!patch) return
    advanceLockRef.current = true
    setAdvanceLocked(true)
    try {
      if (step.key === 'followup' && comment) {
        await run({ ...patch, comment })
        setComment('')
      } else {
        await run(patch)
      }
    } finally {
      window.setTimeout(() => {
        advanceLockRef.current = false
        setAdvanceLocked(false)
      }, 900)
    }
  }

  async function handleHatBack() {
    if (!hatNav.backPatch) return
    const title = hatNav.backTitle || 'предыдущий'
    if (!window.confirm(`Вернуться на шаг «${title}»? Отметка текущего шага снимется.`)) return
    await run(hatNav.backPatch)
  }

  async function handleHatSkip() {
    if (!hatNav.skipPatch) return
    if (!window.confirm('Пропустить этот шаг? Отметим как сделанный без доп. действия.')) return
    await run(hatNav.skipPatch)
  }

  async function handleStartTraining() {
    if (typeof onStartTraining !== 'function') {
      onOpenDiaries?.()
      return
    }
    setStartBusy(true)
    setError('')
    try {
      await onStartTraining()
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setStartBusy(false)
    }
  }

  function onMessengerResult(r) {
    if (!r?.ok) {
      setToast('Не удалось отправить — скопируйте текст вручную')
    } else if (r.channel === 'max') {
      setToast(r.opened ? 'Текст скопирован, Max открыт' : 'Текст скопирован — вставьте в Max')
    } else {
      setToast(r.shared ? 'Выберите мессенджер' : 'Скопировано — вставьте клиенту')
    }
    setTimeout(() => setToast(''), 3500)
  }

  const funnelHat = (
    <PnkFunnelHat
      step={step}
      nav={hatNav}
      busy={busy || advanceLocked}
      hideNav={step.key === 'close'}
      showRefuse={step.key !== 'close'}
      onBack={() => void handleHatBack()}
      onNext={() => void handleHatNext()}
      onSkip={() => void handleHatSkip()}
      onRefuse={() => setConfirmRefuse(true)}
    />
  )

  const visitMessengers = (
    <PnkClientMessengerButtons
      kind="invite"
      client={client}
      trainerName={trainerName}
      clubName=""
      trialDate={trialDate}
      trialTime={trialTime}
      busy={busy}
      onResult={onMessengerResult}
    />
  )

  return (
    <section className="pnk-client-panel" aria-label="Воронка ПНК">
      <div className="pnk-funnel-hat-sticky">{funnelHat}</div>

      {confirmRefuse ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pnk-refuse-title"
          onClick={() => !busy && setConfirmRefuse(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="pnk-refuse-title" className="section-title" style={{ marginTop: 0 }}>
              Подтвердить отказ?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Карточка <strong style={{ color: 'var(--text)' }}>{String(client?.name ?? '').trim() || 'клиента'}</strong>{' '}
              и все абонементы будут удалены. В статистике останется только отметка, что ПНК был и не оформился.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy}
                onClick={() => setConfirmRefuse(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-touch pnk-client-panel__refuse-confirm"
                disabled={busy}
                onClick={() => void handleRefuseConfirm()}
              >
                {busy ? 'Удаление…' : 'Да, отказ'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {flags.length && step.key !== 'wait' && step.key !== 'date' && step.key !== 'contact' ? (
        <PnkAttentionChips flags={flags} />
      ) : null}

      {toast ? (
        <p className="sync-feedback sync-feedback--ok" role="status">
          {toast}
        </p>
      ) : null}
      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      {step.key === 'contact' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__cta-hint">
            Напишите клиенту. Когда связались — кнопка «далее» в шапке.
          </p>
          <div className="pnk-client-panel__actions pnk-client-panel__actions--secondary">
            <PnkClientMessengerButtons
              kind="invite"
              client={client}
              trainerName={trainerName}
              clubName=""
              trialDate={trialDate}
              trialTime={trialTime}
              busy={busy}
              onResult={onMessengerResult}
            />
          </div>
        </div>
      ) : null}

      {step.key === 'date' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__cta-hint">
            Назначьте дату бесплатной. Затем сохраните в шапке (галочка).
          </p>
          <div className="pnk-client-panel__schedule">
            <label className="pnk-client-panel__field">
              Дата бесплатной
              <input
                className="input"
                type="date"
                value={trialDate}
                onChange={(e) => setTrialDate(e.target.value)}
              />
            </label>
            <label className="pnk-client-panel__field">
              Время
              <input
                className="input"
                type="time"
                value={trialTime}
                onChange={(e) => setTrialTime(e.target.value)}
              />
            </label>
          </div>
          <div className="pnk-client-panel__actions pnk-client-panel__actions--secondary">
            {visitMessengers}
          </div>
        </div>
      ) : null}

      {step.key === 'wait' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__cta-hint">
            Когда клиент в зале — нажмите кнопку с человечком в шапке («Клиент пришёл»).
          </p>
          <div className="pnk-client-panel__schedule">
            <label className="pnk-client-panel__field">
              Дата
              <input
                className="input"
                type="date"
                value={trialDate}
                onChange={(e) => setTrialDate(e.target.value)}
              />
            </label>
            <label className="pnk-client-panel__field">
              Время
              <input
                className="input"
                type="time"
                value={trialTime}
                onChange={(e) => setTrialTime(e.target.value)}
              />
            </label>
          </div>
          <div className="pnk-client-panel__actions pnk-client-panel__actions--secondary">
            {visitMessengers}
            <button
              type="button"
              className="btn btn-secondary btn-touch btn-icon-square"
              disabled={busy || !trialDate}
              aria-label="Изменить дату"
              title="Изменить дату бесплатной"
              onClick={() =>
                void run({
                  trial_date: trialDate,
                  trial_time: trialTime,
                })
              }
            >
              <CalendarClock size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {step.key === 'health' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__cta-hint">
            Ниже — карта здоровья и обмеры (один экран). Когда карта готова — к питанию в шапке.
          </p>
        </div>
      ) : null}

      {step.key === 'nutrition' ? (
        <div className="pnk-client-panel__step">
          {advance.ok ? (
            <p className="pnk-client-panel__ok" style={{ margin: 0 }}>
              ✓ Рацион есть — «К тренировке» в шапке
            </p>
          ) : (
            <p className="pnk-client-panel__cta-hint">
              Сохраните рацион ниже. Или <strong>Пропустить</strong> в шапке, если рациона нет.
            </p>
          )}
        </div>
      ) : null}

      {step.key === 'train1' || step.key === 'train2' ? (
        <div className="pnk-client-panel__step">
          <div className="pnk-client-panel__actions pnk-client-panel__actions--step">
            {typeof onStartTraining === 'function' || typeof onOpenDiaries === 'function' ? (
              <button
                type="button"
                className={
                  primaryInBody
                    ? 'btn btn-primary btn-touch pnk-client-panel__btn-primary pnk-client-panel__btn-cta'
                    : 'btn btn-secondary btn-touch'
                }
                disabled={busy || startBusy}
                onClick={() => void handleStartTraining()}
              >
                <Dumbbell size={18} aria-hidden /> Начать тренировку
              </button>
            ) : null}
          </div>
          {advance.ok ? (
            <p className="pnk-client-panel__ok" style={{ margin: '8px 0 0' }}>
              ✓ Тренировка есть — «Далее» в шапке
            </p>
          ) : (
            <p className="pnk-client-panel__cta-hint" style={{ marginTop: 8 }}>
              Одна главная кнопка: начните БЗ, после завершения вернитесь и нажмите «Далее».
            </p>
          )}
        </div>
      ) : null}

      {step.key === 'hw1' || step.key === 'hw2' ? (
        <div className="pnk-client-panel__step">
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Выдайте ДЗ во вкладке ниже, затем «Далее» или «Пропустить» в шапке.
          </p>
          {((step.key === 'hw1' && d.homework) || (step.key === 'hw2' && d.homework2)) && (
            <p className="pnk-client-panel__ok" style={{ margin: '8px 0 0' }}>
              ✓ ДЗ отмечено
            </p>
          )}
        </div>
      ) : null}

      {step.key === 'followup' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__sub">Написать клиенту снова</p>
          <div className="pnk-client-panel__actions">
            <PnkClientMessengerButtons
              kind="followup"
              client={client}
              trainerName={trainerName}
              clubName=""
              busy={busy}
              onResult={onMessengerResult}
            />
          </div>
          <label className="pnk-client-panel__field">
            Комментарий после разговора
            <input
              className="input"
              value={comment}
              placeholder="Что ответил клиент"
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {step.key === 'close' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__sub">
            Сначала оформите платный абонемент во вкладке ниже. Только потом — «Оформлен (ДК)».
          </p>
          {!hasDkMembership ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              Платного абонемента пока нет — «Далее» здесь не оформляет клиента.
            </p>
          ) : (
            <p className="pnk-client-panel__ok" style={{ margin: 0 }}>
              ✓ Платный абонемент есть — можно оформить
            </p>
          )}
          <div className="pnk-client-panel__actions pnk-client-panel__actions--step">
            <button
              key={`pnk-won-${client.id}`}
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy || !hasDkMembership || advanceLocked}
              title={!hasDkMembership ? 'Сначала оформите ДК во вкладке «Абонементы»' : 'Оформить как ДК'}
              onClick={() => {
                if (!hasDkMembership) {
                  setError('Сначала оформите платный абонемент (ДК)')
                  if (typeof onOpenTab === 'function') onOpenTab('memberships')
                  return
                }
                if (
                  !window.confirm(
                    'Оформить клиента как ДК? Он станет активным. Это не кнопка «Далее» — только финальное оформление.',
                  )
                ) {
                  return
                }
                void run({
                  stage: 'won',
                  comment: comment || undefined,
                  require_dk_membership: true,
                  has_dk_membership: true,
                })
              }}
            >
              <Trophy size={18} aria-hidden /> Оформлен (ДК)
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-touch pnk-client-panel__btn-secondary"
              disabled={busy}
              onClick={() => setConfirmRefuse(true)}
            >
              <Ban size={18} aria-hidden /> Отказ
            </button>
          </div>
          <label className="pnk-client-panel__field">
            Если отказ — причина
            <input
              className="input"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Дорого / не готов"
            />
          </label>
        </div>
      ) : null}

      {client.pnk_comment ? <p className="pnk-funnel__comment">Последний: «{client.pnk_comment}»</p> : null}
    </section>
  )
}
