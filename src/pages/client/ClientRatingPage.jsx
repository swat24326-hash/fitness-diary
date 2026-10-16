import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { ClientStarRating } from '../../components/client/ClientStarRating.jsx'
import { clientRatingCopy, normalizeRatingScore } from '../../lib/client/clientRatingCore.js'
import { hasClientSession, postClientMe } from '../../lib/client/clientSession.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { useClientMe } from './useClientMe.js'

/** /me/rate/:id — оценка после последней тренировки абонемента. */
export function ClientRatingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, status, reload } = useClientMe()
  const [score, setScore] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rating, setRating] = useState(null)
  const [copy, setCopy] = useState(clientRatingCopy('membership'))
  const [loadStatus, setLoadStatus] = useState('loading')

  useEffect(() => {
    if (!hasClientSession() || !id) return undefined
    let cancelled = false
    setLoadStatus('loading')
    setError('')
    postClientMe({ action: 'rating-get', id })
      .then((res) => {
        if (cancelled) return
        const r = res?.rating
        setRating(r)
        setCopy(res?.copy ?? clientRatingCopy(r?.kind ?? 'membership'))
        if (r?.score != null) setScore(normalizeRatingScore(r.score))
        if (r?.comment) setComment(String(r.comment))
        setLoadStatus('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Не удалось открыть оценку')
        setLoadStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!hasClientSession() || status === 'signed_out') return <Navigate to={CLIENT_HOME} replace />

  const done = Boolean(rating?.answered_at || rating?.read_at)
  const club = data?.club ?? null

  const submit = async () => {
    const s = normalizeRatingScore(score)
    if (s == null) {
      setError('Поставьте оценку от 1 до 5')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await postClientMe({ action: 'rating-answer', id, score: s, comment })
      setRating(res?.rating ?? rating)
      reload()
    } catch (e) {
      setError(e?.message || 'Не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  /** «Позже» — не снимаем запрос, просто уходим; оценка останется в ленте. */
  const later = () => navigate('/me/notifications', { replace: true })

  let body
  if (loadStatus === 'loading') {
    body = <ClientMeStatus title="Загружаем…" />
  } else if (loadStatus === 'error' || !rating) {
    body = <ClientMeStatus icon={Star} title="Оценка недоступна" hint={error || 'Запрос не найден'} />
  } else if (done) {
    body = (
      <div className="client-rating-page">
        <ClientMeStatus icon={Star} title={copy.thanks} hint={rating.body} />
        <button type="button" className="btn btn-touch" onClick={() => navigate('/me/notifications', { replace: true })}>
          К уведомлениям
        </button>
      </div>
    )
  } else {
    body = (
      <div className="client-rating-page">
        <p className="client-rating-page__lead">{copy.subtitle}</p>
        <ClientStarRating value={score} onChange={setScore} disabled={busy} />
        <label className="sr-only" htmlFor="client-rating-comment">
          Комментарий
        </label>
        <textarea
          id="client-rating-comment"
          className="client-rating-page__comment"
          placeholder="Можно пару слов (необязательно)"
          maxLength={300}
          value={comment}
          disabled={busy}
          onChange={(e) => setComment(e.target.value)}
        />
        {error ? (
          <p className="client-me-offline" role="alert">
            {error}
          </p>
        ) : null}
        <div className="client-rating-page__actions">
          <button type="button" className="btn btn-primary btn-touch" disabled={busy || score == null} onClick={() => void submit()}>
            Отправить
          </button>
          <button type="button" className="btn btn-touch" disabled={busy} onClick={later}>
            Позже
          </button>
        </div>
      </div>
    )
  }

  return (
    <ClientMeShell actions={<ClientPageActions onRefresh={reload} />} club={club}>
      <ClientPageTitle title={copy.title} to="/me/notifications" />
      {body}
    </ClientMeShell>
  )
}
