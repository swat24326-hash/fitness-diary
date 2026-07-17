import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Ban, Trophy, Heart, Utensils, Dumbbell, ClipboardList } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  buildPnkAttentionFlags,
  isOpenPnkClient,
  parsePnkDeliverables,
  resolvePnkTrainerUiStep,
} from '../../lib/pnk/pnkStagesCore'
import { canAdvancePnkWizardStep, buildPnkWizardAdvancePatch, buildPnkVisitStartedPatch } from '../../lib/pnk/pnkWizardCore'
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { PnkClientMessengerButtons } from '../pnk/PnkClientMessengerButtons'
import { PnkStepBlocks } from '../pnk/PnkStepBlocks'
import { PnkAttentionChips } from '../pnk/PnkStatusChips'
import '../../styles/pnk-funnel.css'

/**
 * Линейный мастер ПНК у тренера (1 или 2 бесплатные).
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
  const autoStartTrainRef = useRef('')

  useEffect(() => {
    setTrialDate(String(client?.pnk_trial_date ?? '').slice(0, 10))
    setTrialTime(String(client?.pnk_trial_time ?? ''))
  }, [client?.id, client?.pnk_trial_date, client?.pnk_trial_time])

  const openPnk = Boolean(client && isOpenPnkClient(client))
  const ctx = openPnk
    ? { healthCard, bzCompletedCount: Math.min(2, Math.max(0, Number(bzCompletedCount) || 0)) }
    : null
  const step = openPnk ? resolvePnkTrainerUiStep(client, ctx) : null

  useEffect(() => {
    if (!step?.tab) return
    if (typeof onOpenTab === 'function') onOpenTab(step.tab)
  }, [step?.key, step?.tab, onOpenTab])

  /** Шаг тренировки → сразу форма упражнений (не список дневников). */
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

  if (!openPnk || !step) return null

  const advance = canAdvancePnkWizardStep(client, step, ctx)
  const flags = buildPnkAttentionFlags(client)
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const trainerName = user?.name || ''
  const showNext = Boolean(buildPnkWizardAdvancePatch(step))

  async function run(patch) {
    if (!patch) return
    setBusy(true)
    setError('')
    try {
      const res = await patchPnkClientLocal(client, patch)
      if (!res.ok) {
        setError(res.error || 'Ошибка')
        return
      }
      onUpdated?.(res.client)
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
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

  function openTab(tabId) {
    if (typeof onOpenTab === 'function') onOpenTab(tabId)
  }

  function earlyLostButton() {
    if (step.key === 'close') return null
    return (
      <button
        type="button"
        className="btn btn-ghost btn-touch pnk-client-panel__btn-secondary"
        disabled={busy}
        onClick={() => void run({ stage: 'lost', lost_reason: lostReason || comment || 'Отказ' })}
      >
        Отказ
      </button>
    )
  }

  /** Один ряд: основные действия + «Далее» (зелёная чуть длиннее) + отказ */
  function stepActions(mainButtons, opts = {}) {
    const includeNext = opts.includeNext !== false && showNext
    return (
      <>
        <div className="pnk-client-panel__actions pnk-client-panel__actions--step">
          {mainButtons}
          {includeNext ? (
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy || !advance.ok}
              title={!advance.ok ? advance.reason : 'Далее'}
              onClick={() => {
                const patch = buildPnkWizardAdvancePatch(step)
                if (!patch) return
                if (step.key === 'followup' && comment) {
                  void run({ ...patch, comment })
                  setComment('')
                  return
                }
                void run(patch)
              }}
            >
              Далее
            </button>
          ) : null}
          {earlyLostButton()}
        </div>
        {includeNext && !advance.ok && advance.reason ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {advance.reason}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <section className="pnk-client-panel" aria-label="Воронка ПНК">
      <div className="pnk-client-panel__head">
        <div className="pnk-client-panel__head-main">
          <p className="pnk-client-panel__step-kicker">ПНК</p>
          <h2 className="pnk-client-panel__title">{step.title}</h2>
        </div>
        <span className="pnk-control-tile__step-badge">
          {step.n}/{step.total}
        </span>
      </div>

      <PnkStepBlocks stepN={step.n} stepTotal={step.total} />

      <p className="pnk-client-panel__help">{step.help}</p>

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

          <div className="pnk-client-panel__actions pnk-client-panel__actions--step">
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy || !trialDate}
              onClick={() => {
                void run({
                  stage: 'agreed',
                  trial_date: trialDate,
                  trial_time: trialTime,
                  deliverable: 'contact',
                })
              }}
            >
              <CalendarPlus size={18} aria-hidden /> Сохранить дату
            </button>
            {earlyLostButton()}
          </div>
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
          <div className="pnk-client-panel__actions pnk-client-panel__actions--step">
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
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy}
              onClick={() => void run(buildPnkVisitStartedPatch())}
            >
              Клиент пришёл
            </button>
            {earlyLostButton()}
          </div>
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
          {stepActions(
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              onClick={() => openTab('health')}
            >
              <Heart size={16} aria-hidden /> Открыть здоровье
            </button>,
          )}
        </div>
      ) : null}

      {step.key === 'nutrition' ? (
        <div className="pnk-client-panel__step">
          {advance.ok ? (
            <p className="pnk-client-panel__ok" style={{ margin: 0 }}>
              ✓ Рацион сохранён — можно «Далее»
            </p>
          ) : null}
          {stepActions(
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              onClick={() => openTab('nutrition')}
            >
              <Utensils size={16} aria-hidden /> Открыть питание
            </button>,
          )}
        </div>
      ) : null}

      {step.key === 'train1' || step.key === 'train2' ? (
        <div className="pnk-client-panel__step">
          {stepActions(
            typeof onStartTraining === 'function' || typeof onOpenDiaries === 'function' ? (
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
            ) : null,
          )}
        </div>
      ) : null}

      {step.key === 'hw1' ? (
        <div className="pnk-client-panel__step">
          {stepActions(
            <>
              <button
                type="button"
                className="btn btn-secondary btn-touch"
                onClick={() => openTab('homework')}
              >
                <ClipboardList size={16} aria-hidden /> Открыть ДЗ
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy || Boolean(d.homework)}
                onClick={() => void run({ deliverable: 'homework' })}
              >
                ДЗ выдано
              </button>
            </>,
          )}
        </div>
      ) : null}

      {step.key === 'hw2' ? (
        <div className="pnk-client-panel__step">
          {stepActions(
            <>
              <button
                type="button"
                className="btn btn-secondary btn-touch"
                onClick={() => openTab('homework')}
              >
                <ClipboardList size={16} aria-hidden /> Открыть ДЗ
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy || Boolean(d.homework2)}
                onClick={() => void run({ deliverable: 'homework2' })}
              >
                ДЗ выдано
              </button>
            </>,
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
          {stepActions(null)}
        </div>
      ) : null}

      {step.key === 'close' ? (
        <div className="pnk-client-panel__step">
          <div className="pnk-client-panel__actions">
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy}
              onClick={() => void run({ stage: 'won', comment: comment || undefined })}
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
