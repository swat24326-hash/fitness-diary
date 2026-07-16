import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CalendarPlus, Ban, Trophy, Heart, Utensils, ClipboardList, Ticket, Dumbbell } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatDateRu } from '../../lib/dateRu'
import {
  buildPnkAttentionFlags,
  isOpenPnkClient,
  parsePnkDeliverables,
  resolvePnkTrainerUiStep,
} from '../../lib/pnk/pnkStagesCore'
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { PnkClientMessengerButtons } from '../pnk/PnkClientMessengerButtons'
import { PnkStepBlocks } from '../pnk/PnkStepBlocks'
import { PnkAttentionChips } from '../pnk/PnkStatusChips'
import '../../styles/pnk-funnel.css'

/**
 * Воронка ПНК у тренера — шаги, день визита с понятными CTA.
 * onStartTraining — сразу форма тренировки (БЗ); onOpenDiaries — вкладка списка.
 */
export function ClientPnkPanel({ client, onUpdated, onOpenDiaries, onStartTraining, onAddBz }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [trialDate, setTrialDate] = useState('')
  const [trialTime, setTrialTime] = useState('')
  const [comment, setComment] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [startBusy, setStartBusy] = useState(false)

  useEffect(() => {
    setTrialDate(String(client?.pnk_trial_date ?? '').slice(0, 10))
    setTrialTime(String(client?.pnk_trial_time ?? ''))
    setRescheduleOpen(false)
  }, [client?.id, client?.pnk_trial_date, client?.pnk_trial_time])

  if (!client || !isOpenPnkClient(client)) return null

  const step = resolvePnkTrainerUiStep(client)
  if (!step) return null

  const flags = buildPnkAttentionFlags(client)
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const trainerName = user?.name || ''
  const clubName = ''
  const showEarlyLost = step.key !== 'close'

  async function run(patch) {
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

  function earlyLostButton() {
    if (!showEarlyLost) return null
    return (
      <button
        type="button"
        className="btn btn-ghost btn-touch pnk-client-panel__btn-secondary"
        disabled={busy}
        onClick={() => void run({ stage: 'lost', lost_reason: lostReason || comment || 'Отказ' })}
      >
        Отказ на этом шаге
      </button>
    )
  }

  function rescheduleFields() {
    return (
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
    )
  }

  async function saveReschedule() {
    await run({
      stage: 'agreed',
      trial_date: trialDate,
      trial_time: trialTime,
      comment: comment || 'Перенос даты',
    })
    setRescheduleOpen(false)
  }

  const doneBits = [
    d.contact || client.pnk_trial_date ? 'Контакт/дата' : null,
    d.trial ? 'Бесплатная' : null,
    d.nutrition ? 'Питание' : null,
    d.homework ? 'ДЗ' : null,
    d.followup ? 'Уточнение' : null,
  ].filter(Boolean)

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

      {flags.length ? <PnkAttentionChips flags={flags} /> : null}

      {doneBits.length ? (
        <p className="pnk-client-panel__done muted">Уже сделано: {doneBits.join(' · ')}</p>
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

      {step.key === 'created' ? (
        <div className="pnk-client-panel__step">
          <div className="pnk-client-panel__actions">
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy}
              onClick={() => void run({ stage: 'contact' })}
            >
              Дальше: контакт и дата
            </button>
            {earlyLostButton()}
          </div>
        </div>
      ) : null}

      {step.key === 'invite' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__sub">Написать клиенту</p>
          <div className="pnk-client-panel__actions">
            <PnkClientMessengerButtons
              kind="invite"
              client={client}
              trainerName={trainerName}
              clubName={clubName}
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
            <label className="pnk-client-panel__field pnk-client-panel__field--grow">
              Комментарий
              <input
                className="input"
                value={comment}
                placeholder="Что договорились"
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          </div>

          <div className="pnk-client-panel__actions">
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy || !trialDate}
              onClick={() => {
                void run({
                  stage: 'agreed',
                  trial_date: trialDate,
                  trial_time: trialTime,
                  comment: comment || undefined,
                  deliverable: 'contact',
                })
                setComment('')
              }}
            >
              <CalendarPlus size={18} aria-hidden /> Сохранить дату — к бесплатной
            </button>
            {earlyLostButton()}
          </div>
        </div>
      ) : null}

      {step.key === 'visit' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__schedule-line">
            Ориентир по дате:{' '}
            <strong>
              {formatDateRu(client.pnk_trial_date)}
              {client.pnk_trial_time ? ` ${client.pnk_trial_time}` : ''}
            </strong>
            <span className="muted"> · можно начать тренировку в любой день</span>
          </p>

          <div className="pnk-client-panel__visit-links">
            <Link to="?tab=health" className="btn btn-secondary btn-touch u-no-decoration">
              <Heart size={16} aria-hidden /> Здоровье
            </Link>
            <Link to="?tab=nutrition" className="btn btn-secondary btn-touch u-no-decoration">
              <Utensils size={16} aria-hidden /> Питание
            </Link>
            <Link to="?tab=homework" className="btn btn-secondary btn-touch u-no-decoration">
              <ClipboardList size={16} aria-hidden /> ДЗ
            </Link>
            <Link to="?tab=memberships" className="btn btn-secondary btn-touch u-no-decoration">
              <Ticket size={16} aria-hidden /> Абонементы
            </Link>
          </div>

          <div className="pnk-client-panel__actions pnk-client-panel__actions--wrap">
            {!d.nutrition ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy}
                onClick={() => void run({ deliverable: 'nutrition' })}
              >
                ✓ Питание выдано
              </button>
            ) : (
              <span className="pnk-client-panel__ok">✓ Питание</span>
            )}
            {!d.homework ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy}
                onClick={() => void run({ deliverable: 'homework' })}
              >
                ✓ ДЗ выдано
              </button>
            ) : (
              <span className="pnk-client-panel__ok">✓ ДЗ</span>
            )}
          </div>

          <div className="pnk-client-panel__actions">
            {typeof onStartTraining === 'function' || typeof onOpenDiaries === 'function' ? (
              <button
                type="button"
                className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
                disabled={busy || startBusy}
                onClick={() => void handleStartTraining()}
              >
                <Dumbbell size={18} aria-hidden /> Начать тренировку
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              disabled={busy}
              onClick={() => void run({ stage: 'trial_done', deliverable: 'trial' })}
            >
              <Check size={18} aria-hidden /> Проведена
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-touch pnk-client-panel__btn-secondary"
              onClick={() => setRescheduleOpen((v) => !v)}
            >
              Изменить дату
            </button>
          </div>

          <div className="pnk-client-panel__actions">
            {typeof onAddBz === 'function' ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={busy || startBusy}
                onClick={() => void onAddBz()}
              >
                <Ticket size={16} aria-hidden /> Добавить БЗ
              </button>
            ) : null}
            {typeof onOpenDiaries === 'function' ? (
              <button type="button" className="btn btn-ghost btn-touch" onClick={() => onOpenDiaries()}>
                Список тренировок
              </button>
            ) : null}
            {earlyLostButton()}
          </div>

          {rescheduleOpen ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                Дата в воронке — только ориентир для команды. На старт тренировки не влияет.
              </p>
              {rescheduleFields()}
              <div className="pnk-client-panel__actions">
                <button
                  type="button"
                  className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
                  disabled={busy || !trialDate}
                  onClick={() => void saveReschedule()}
                >
                  <CalendarPlus size={18} aria-hidden /> Сохранить дату
                </button>
              </div>
            </>
          ) : null}
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
              clubName={clubName}
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
          <div className="pnk-client-panel__actions">
            <button
              type="button"
              className="btn btn-primary btn-touch pnk-client-panel__btn-primary"
              disabled={busy}
              onClick={() => {
                void run({
                  stage: 'followup',
                  deliverable: 'followup',
                  comment: comment || undefined,
                })
                setComment('')
              }}
            >
              <Check size={18} aria-hidden /> Уточнение сделано — к оформлению
            </button>
            {earlyLostButton()}
          </div>
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
