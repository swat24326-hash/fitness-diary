import { useEffect, useRef, useState } from 'react'
import { Ban, Trophy, Dumbbell } from 'lucide-react'
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
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { listMemberships } from '../../lib/dataAccess'
import { ensureMembershipTypesForClub } from '../../lib/membershipTypesService'
import { PnkClientMessengerButtons } from '../pnk/PnkClientMessengerButtons'
import { PnkFunnelHat } from '../pnk/PnkFunnelHat'
import { PnkAttentionChips } from '../pnk/PnkStatusChips'
import '../../styles/pnk-funnel.css'

/**
 * Линейный мастер ПНК у тренера: единая шапка Назад / Далее / Пропустить.
 */
export function ClientPnkPanel({
  client,
  onUpdated,
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
    if (!step?.tab) return
    if (typeof onOpenTab === 'function') onOpenTab(step.tab)
  }, [step?.key, step?.tab, onOpenTab])

  useEffect(() => {
    if (step?.key !== 'close') return
    if (typeof onOpenTab === 'function') onOpenTab('memberships')
  }, [step?.key, onOpenTab])

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

  return (
    <section className="pnk-client-panel" aria-label="Воронка ПНК">
      <div className="pnk-funnel-hat-sticky">
        <PnkFunnelHat
          step={step}
          nav={hatNav}
          busy={busy || advanceLocked}
          hideNav={step.key === 'close'}
          onBack={() => void handleHatBack()}
          onNext={() => void handleHatNext()}
          onSkip={() => void handleHatSkip()}
        />
        {step.key !== 'close' ? (
          <button
            type="button"
            className="btn btn-ghost btn-touch pnk-funnel-hat__refuse"
            disabled={busy}
            onClick={() => void run({ stage: 'lost', lost_reason: lostReason || comment || 'Отказ' })}
          >
            <Ban size={16} aria-hidden /> Отказ
          </button>
        ) : null}
      </div>

      {flags.length && step.key !== 'wait' && step.key !== 'invite' ? <PnkAttentionChips flags={flags} /> : null}

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

      {step.key === 'invite' ? (
        <div className="pnk-client-panel__step">
          <div className="pnk-client-panel__actions">
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
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Укажите дату и нажмите «Далее» в шапке воронки.
          </p>
        </div>
      ) : null}

      {step.key === 'wait' ? (
        <div className="pnk-client-panel__step">
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
          <div className="pnk-client-panel__actions">
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              disabled={busy || !trialDate}
              onClick={() =>
                void run({
                  trial_date: trialDate,
                  trial_time: trialTime,
                })
              }
            >
              Изменить дату
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Когда клиент в зале — «Далее» в шапке (= клиент пришёл).
          </p>
          <div className="pnk-client-panel__actions" style={{ marginTop: 8 }}>
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

      {step.key === 'health' ? (
        <div className="pnk-client-panel__step">
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Заполните карту ниже, затем «Далее» в шапке.
          </p>
        </div>
      ) : null}

      {step.key === 'nutrition' ? (
        <div className="pnk-client-panel__step">
          {advance.ok ? (
            <p className="pnk-client-panel__ok" style={{ margin: 0 }}>
              ✓ Рацион сохранён — можно «Далее» или «Пропустить»
            </p>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              Сохраните рацион ниже или нажмите «Пропустить» в шапке.
            </p>
          )}
        </div>
      ) : null}

      {step.key === 'train1' || step.key === 'train2' ? (
        <div className="pnk-client-panel__step">
          <div className="pnk-client-panel__actions">
            {typeof onStartTraining === 'function' || typeof onOpenDiaries === 'function' ? (
              <button
                type="button"
                className={
                  advance.ok
                    ? 'btn btn-secondary btn-touch'
                    : 'btn btn-primary btn-touch pnk-client-panel__btn-primary'
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
          ) : null}
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
              onClick={() => void run({ stage: 'lost', lost_reason: lostReason || 'Отказ' })}
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
