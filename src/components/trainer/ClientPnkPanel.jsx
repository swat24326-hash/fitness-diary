import { useState } from 'react'
import { Check, Phone, CalendarPlus, Ban, Trophy } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu'
import {
  buildPnkAttentionFlags,
  buildPnkStageProgress,
  isOpenPnkClient,
  parsePnkDeliverables,
} from '../../lib/pnk/pnkStagesCore'
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { PnkAttentionChips, PnkDeliverableChips, PnkStageChip } from '../pnk/PnkStatusChips'
import '../../styles/pnk-funnel.css'

/**
 * Блок воронки ПНК на карточке клиента (тренер / админ).
 */
export function ClientPnkPanel({ client, onUpdated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [trialDate, setTrialDate] = useState(String(client?.pnk_trial_date ?? '').slice(0, 10))
  const [trialTime, setTrialTime] = useState(String(client?.pnk_trial_time ?? ''))
  const [comment, setComment] = useState('')
  const [lostReason, setLostReason] = useState('')

  if (!client || !isOpenPnkClient(client)) return null

  const progress = buildPnkStageProgress(client)
  const flags = buildPnkAttentionFlags(client)
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const noshow = flags.some((f) => f.code === 'noshow')

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

  function onDeliverableToggle(key) {
    if (key === 'contact') {
      void run({ stage: 'contact', deliverable: 'contact' })
      return
    }
    if (key === 'trial') {
      void run({ stage: 'trial_done', deliverable: 'trial' })
      return
    }
    void run({ deliverable: key })
  }

  return (
    <section className="pnk-client-panel" aria-label="Воронка ПНК">
      <div className="pnk-client-panel__head">
        <h2 className="pnk-client-panel__title">ПНК</h2>
        <PnkStageChip stage={client.pnk_stage} />
      </div>

      <div className="pnk-funnel__track" aria-hidden>
        <div className="pnk-funnel__fill" style={{ width: `${progress.pct}%` }} />
      </div>

      <PnkAttentionChips flags={flags} />

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      <PnkDeliverableChips
        client={client}
        interactive
        busy={busy}
        onToggle={onDeliverableToggle}
        links={{
          nutrition: '?tab=nutrition',
          homework: '?tab=homework',
        }}
      />

      <div className="pnk-client-panel__schedule">
        <label className="pnk-client-panel__field">
          Дата пробной
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
            placeholder="Что сказал клиент"
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
      </div>

      <div className="pnk-client-panel__cta-row">
        {!d.contact ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'contact', deliverable: 'contact' })}
          >
            <Phone size={18} aria-hidden /> Позвонил / Max
          </button>
        ) : null}
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
          <CalendarPlus size={18} aria-hidden /> Сохранить дату
        </button>
        {!d.trial ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'trial_done', deliverable: 'trial' })}
          >
            <Check size={18} aria-hidden /> Пробная проведена
          </button>
        ) : null}
      </div>

      {client.pnk_trial_date ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          Пробная: {formatDateRu(client.pnk_trial_date)}
          {client.pnk_trial_time ? ` ${client.pnk_trial_time}` : ''}
        </p>
      ) : null}

      {noshow ? (
        <div className="pnk-client-panel__noshow">
          <p>
            <strong>Клиент не отмечен на пробной.</strong> Продолжаем с этим ПНК?
          </p>
          <div className="pnk-client-panel__cta-row">
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
          </div>
          <label className="pnk-client-panel__field">
            Причина отказа
            <input
              className="input"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Не отвечает / отказался"
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'lost', lost_reason: lostReason || 'Отказ после неявки' })}
          >
            <Ban size={18} aria-hidden /> Закрыть без оформления
          </button>
        </div>
      ) : null}

      <div className="pnk-client-panel__close-row">
        <button
          type="button"
          className="btn btn-primary btn-touch"
          disabled={busy}
          onClick={() => void run({ stage: 'won', comment: comment || undefined })}
        >
          <Trophy size={18} aria-hidden /> Оформлен (ДК)
        </button>
        {!noshow ? (
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            disabled={busy}
            onClick={() => void run({ stage: 'lost', lost_reason: lostReason || comment || 'Отказ' })}
          >
            <Ban size={18} aria-hidden /> Отказ
          </button>
        ) : null}
      </div>

      {client.pnk_comment ? <p className="pnk-funnel__comment">Последний: «{client.pnk_comment}»</p> : null}
    </section>
  )
}
