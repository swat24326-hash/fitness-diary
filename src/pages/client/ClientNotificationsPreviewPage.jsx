/**
 * Локальный разбор: все kinds ленты + примеры push. Только DEV.
 * Строки кликабельны → /me/notifications-preview/:id
 */
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Megaphone,
  Salad,
  Smartphone,
  Star,
  Ticket,
} from 'lucide-react'
import { ClientStarRating } from '../../components/client/ClientStarRating.jsx'
import { formatRatingScoreRu, normalizeRatingScore } from '../../lib/client/clientRatingCore.js'
import { CLIENT_NOTIFICATION_KINDS } from '../../lib/client/clientNotificationsCore.js'
import {
  CLIENT_NOTIFICATIONS_PREVIEW_PATH,
  clientNotificationsFeedPreviewSamples,
  clientNotificationsPreviewSample,
  clientNotificationsPushPreviewSamples,
} from '../../lib/client/clientNotificationsPreviewSamples.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'

function NotifIcon({ kind }) {
  if (kind === CLIENT_NOTIFICATION_KINDS.nutrition_sent) return <Salad size={20} />
  if (kind === CLIENT_NOTIFICATION_KINDS.membership_expiring || kind === 'push_membership') return <Ticket size={20} />
  if (kind === CLIENT_NOTIFICATION_KINDS.club_survey || kind === CLIENT_NOTIFICATION_KINDS.club_notice) {
    return <Megaphone size={20} />
  }
  if (
    kind === CLIENT_NOTIFICATION_KINDS.rate_membership ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_homework ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_nutrition ||
    kind === 'push_rate'
  ) {
    return <Star size={20} />
  }
  if (String(kind).startsWith('push')) return <Smartphone size={20} />
  return <ClipboardList size={20} />
}

function PreviewRow({ it, i }) {
  const fresh = !it.read_at
  return (
    <li style={{ '--i': i }}>
      <Link to={it.deep_link} className={`client-inbox__row${fresh ? ' client-inbox__row--new' : ''}`}>
        <span className="client-inbox__icon" aria-hidden>
          <NotifIcon kind={it.kind} />
        </span>
        <span className="client-inbox__body">
          <strong>{it.title}</strong>
          <small>{it.body}</small>
          <small style={{ opacity: 0.65 }}>{it.channel || it.kind}</small>
        </span>
        {fresh ? <span className="client-inbox__dot" aria-label="Новое" /> : null}
        <ChevronRight size={18} className="client-inbox__go" aria-hidden />
      </Link>
    </li>
  )
}

function PreviewRatingDetail({ copy }) {
  const [score, setScore] = useState(null)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const s = normalizeRatingScore(score)

  if (sent) {
    return (
      <div className="client-rating-page">
        <ClientMeStatus
          icon={Star}
          title={copy.thanks}
          hint={s != null ? `Ваша оценка: ${formatRatingScoreRu(s)}` : ''}
        />
        <Link className="btn btn-touch" to={CLIENT_NOTIFICATIONS_PREVIEW_PATH}>
          К превью ленты
        </Link>
      </div>
    )
  }

  return (
    <div className="client-rating-page">
      <p className="client-rating-page__lead">{copy.subtitle}</p>
      <ClientStarRating value={score} onChange={setScore} />
      <label className="sr-only" htmlFor="preview-rating-comment">
        Комментарий
      </label>
      <textarea
        id="preview-rating-comment"
        className="client-rating-page__comment"
        placeholder="Можно пару слов (необязательно)"
        maxLength={300}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="client-rating-page__actions">
        <button type="button" className="btn btn-primary btn-touch" disabled={s == null} onClick={() => setSent(true)}>
          Отправить
        </button>
        <Link className="btn btn-touch" to={CLIENT_NOTIFICATIONS_PREVIEW_PATH}>
          Позже
        </Link>
      </div>
      <p className="client-me-muted" style={{ marginTop: 12 }}>
        Превью: оценка никуда не уходит, только чтобы пощупать экран.
      </p>
    </div>
  )
}

function PreviewDetailBody({ sample }) {
  const d = sample.detail
  if (!d) return <ClientMeStatus title="Нет деталей" />
  if (d.type === 'rating') return <PreviewRatingDetail copy={d.copy} />
  if (d.type === 'plan') {
    return (
      <section className="client-me-card">
        <p>{d.lead}</p>
        <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
          {(d.lines ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>
    )
  }
  if (d.type === 'survey') {
    return (
      <>
        <p className="client-me-card client-inbox-item__body">{d.lead}</p>
        <ul className="client-me-card" style={{ listStyle: 'disc', paddingLeft: 20 }}>
          {(d.questions ?? []).map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <p className="client-me-muted">{d.reward}</p>
      </>
    )
  }
  return (
    <>
      <p className="client-me-card client-inbox-item__body">{d.lead}</p>
      {d.hint ? <p className="client-me-muted">{d.hint}</p> : null}
    </>
  )
}

/** Карточка одного примера — по тапу из ленты. */
export function ClientNotificationsPreviewDetailPage() {
  const { id = '' } = useParams()
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  const sample = clientNotificationsPreviewSample(id)
  if (!sample) {
    return (
      <ClientMeShell club={{ name: 'Fit City' }}>
        <ClientPageTitle title="Не найдено" to={CLIENT_NOTIFICATIONS_PREVIEW_PATH} />
        <ClientMeStatus title="Нет такого примера" hint="Вернитесь к списку превью." />
      </ClientMeShell>
    )
  }

  return (
    <ClientMeShell club={{ name: 'Fit City' }}>
      <header className="client-inbox-item__head">
        <ClientPageTitle title={sample.title} to={CLIENT_NOTIFICATIONS_PREVIEW_PATH} />
        <small className="client-me-muted">
          {sample.channel || sample.kind}
          {sample.isPush ? ' · push' : ' · лента'}
        </small>
      </header>
      <PreviewDetailBody sample={sample} />
      {sample.detail?.type === 'rating' ? null : (
        <p style={{ marginTop: 16 }}>
          <Link className="btn btn-touch" to={CLIENT_NOTIFICATIONS_PREVIEW_PATH}>
            <CheckCircle2 size={18} aria-hidden /> К превью ленты
          </Link>
        </p>
      )}
    </ClientMeShell>
  )
}

export function ClientNotificationsPreviewPage() {
  if (!import.meta.env.DEV) {
    return (
      <p style={{ padding: 24 }}>
        Превью только в `npm run dev`. <Link to="/me">На главную</Link>
      </p>
    )
  }

  const feed = clientNotificationsFeedPreviewSamples()
  const pushes = clientNotificationsPushPreviewSamples()

  return (
    <ClientMeShell club={{ name: 'Fit City' }} tabs={false}>
      <ClientPageTitle title="Превью уведомлений" />
      <p className="client-me-offline" role="note">
        Тапайте строки — откроется экран как у клиента. Оценки можно поставить (локально, без сервера).
      </p>

      <h2 className="client-inbox__points" style={{ marginTop: 8 }}>
        <Bell size={18} aria-hidden />
        <span>Лента /me/notifications</span>
      </h2>
      <ol className="client-inbox" data-testid="client-notifications-preview-feed">
        {feed.map((it, i) => (
          <PreviewRow key={it.id} it={it} i={i} />
        ))}
      </ol>

      <h2 className="client-inbox__points" style={{ marginTop: 20 }}>
        <Smartphone size={18} aria-hidden />
        <span>Push на заблокированный экран</span>
      </h2>
      <ol className="client-inbox" data-testid="client-notifications-preview-push">
        {pushes.map((it, i) => (
          <PreviewRow key={it.id} it={it} i={i} />
        ))}
      </ol>
    </ClientMeShell>
  )
}
