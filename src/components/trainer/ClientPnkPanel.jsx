import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CalendarPlus, Ban, Trophy, Heart, Utensils, ClipboardList, Ticket } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatDateRu } from '../../lib/dateRu'
import {
  buildPnkAttentionFlags,
  buildPnkStageProgress,
  isOpenPnkClient,
  parsePnkDeliverables,
  resolvePnkTrainerUiStep,
} from '../../lib/pnk/pnkStagesCore'
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { PnkClientMessengerButtons } from '../pnk/PnkClientMessengerButtons'
import '../../styles/pnk-funnel.css'

/**
 * Воронка ПНК: 5 шагов, на контактах — Max / другой мессенджер.
 */
export function ClientPnkPanel({ client, onUpdated }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [trialDate, setTrialDate] = useState('')
  const [trialTime, setTrialTime] = useState('')
  const [comment, setComment] = useState('')
  const [lostReason, setLostReason] = useState('')

  useEffect(() => {
    setTrialDate(String(client?.pnk_trial_date ?? '').slice(0, 10))
    setTrialTime(String(client?.pnk_trial_time ?? ''))
  }, [client?.id, client?.pnk_trial_date, client?.pnk_trial_time])

  if (!client || !isOpenPnkClient(client)) return null

  const step = resolvePnkTrainerUiStep(client)
  if (!step) return null

  const progress = buildPnkStageProgress(client)
  const flags = buildPnkAttentionFlags(client)
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const noshow = flags.some((f) => f.code === 'noshow')
  const trainerName = user?.name || ''
  const clubName = ''

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
        <div>
          <p className="pnk-client-panel__step-kicker">
            ПНК · шаг {step.n} из {step.total}
          </p>
          <h2 className="pnk-client-panel__title">{step.title}</h2>
        </div>
      </div>

      <div className="pnk-funnel__track" aria-hidden>
        <div className="pnk-funnel__fill" style={{ width: `${progress.pct}%` }} />
      </div>

      <p className="pnk-client-panel__help">{step.help}</p>

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
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'contact' })}
          >
            Дальше: контакт и дата бесплатной
          </button>
        </div>
      ) : null}

      {step.key === 'invite' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__sub">Написать клиенту</p>
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

          <button
            type="button"
            className="btn btn-primary btn-touch"
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
        </div>
      ) : null}

      {step.key === 'visit' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__schedule-line">
            Бесплатная:{' '}
            <strong>
              {formatDateRu(client.pnk_trial_date)}
              {client.pnk_trial_time ? ` ${client.pnk_trial_time}` : ''}
            </strong>
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

          <div className="pnk-client-panel__cta-row">
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

          {!noshow ? (
            <button
              type="button"
              className="btn btn-primary btn-touch"
              disabled={busy}
              onClick={() => void run({ stage: 'trial_done', deliverable: 'trial' })}
            >
              <Check size={18} aria-hidden /> Бесплатная проведена — к уточнению
            </button>
          ) : (
            <div className="pnk-client-panel__noshow">
              <p>
                <strong>Клиент не отмечен на бесплатной.</strong> Продолжаем?
              </p>
              <div className="pnk-client-panel__schedule">
                <label className="pnk-client-panel__field">
                  Новая дата
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
              <button
                type="button"
                className="btn btn-primary btn-touch"
                disabled={busy || !trialDate}
                onClick={() =>
                  void run({
                    stage: 'agreed',
                    trial_date: trialDate,
                    trial_time: trialTime,
                    comment: comment || 'Перенос даты',
                  })
                }
              >
                <CalendarPlus size={18} aria-hidden /> Перенести дату
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-touch"
                disabled={busy}
                onClick={() => void run({ stage: 'lost', lost_reason: lostReason || 'Отказ после неявки' })}
              >
                <Ban size={18} aria-hidden /> Закрыть без оформления
              </button>
            </div>
          )}
        </div>
      ) : null}

      {step.key === 'followup' ? (
        <div className="pnk-client-panel__step">
          <p className="pnk-client-panel__sub">Написать клиенту снова</p>
          <PnkClientMessengerButtons
            kind="followup"
            client={client}
            trainerName={trainerName}
            clubName={clubName}
            busy={busy}
            onResult={onMessengerResult}
          />
          <label className="pnk-client-panel__field">
            Комментарий после разговора
            <input
              className="input"
              value={comment}
              placeholder="Что ответил клиент"
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-touch"
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
        </div>
      ) : null}

      {step.key === 'close' ? (
        <div className="pnk-client-panel__step">
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'won', comment: comment || undefined })}
          >
            <Trophy size={18} aria-hidden /> Оформлен (ДК)
          </button>
          <label className="pnk-client-panel__field">
            Если отказ — причина
            <input
              className="input"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Дорого / не готов"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'lost', lost_reason: lostReason || 'Отказ' })}
          >
            <Ban size={18} aria-hidden /> Отказ
          </button>
        </div>
      ) : null}

      {step.key !== 'close' && !noshow ? (
        <div className="pnk-client-panel__early-lost">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'lost', lost_reason: lostReason || comment || 'Отказ' })}
          >
            Отказ на этом шаге
          </button>
        </div>
      ) : null}

      {client.pnk_comment ? <p className="pnk-funnel__comment">Последний: «{client.pnk_comment}»</p> : null}
    </section>
  )
}
