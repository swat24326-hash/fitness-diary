import { useState } from 'react'
import { ArrowLeft, Lock, RefreshCw, Star } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { closeInboxCampaign } from '../../lib/inbox/inboxAdminApiClient.js'
import { inboxBarPct, inboxRecipientsLabelRu, inboxStatsLineRu, inboxStatusLabelRu } from '../../lib/inbox/inboxAdminUiCore.js'
import { useAdminInboxDetail } from './useAdminInbox.js'

function Bar({ label, count, total }) {
  return (
    <li className="admin-inbox__bar">
      <span className="admin-inbox__bar-label">{label}</span>
      <span className="admin-inbox__bar-track" aria-hidden>
        <span className="admin-inbox__bar-fill" style={{ width: `${inboxBarPct(count, total)}%` }} />
      </span>
      <span className="admin-inbox__bar-count">{count}</span>
    </li>
  )
}

function QuestionResult({ r, index, who }) {
  return (
    <section className="card admin-inbox__result">
      <h3 className="admin-inbox__result-title">
        {index + 1}. {r.text} <small className="muted">· ответов {r.count}</small>
      </h3>
      {r.type === 'rating' ? (
        <>
          <p className="admin-inbox__avg">
            <Star size={18} aria-hidden />
            {r.average != null ? String(r.average).replace('.', ',') : '—'}
            <small className="muted"> из 5</small>
          </p>
          <ul className="admin-inbox__bars">
            {[5, 4, 3, 2, 1].map((n) => (
              <Bar key={n} label={`${n}★`} count={r.distribution[n - 1]} total={r.count} />
            ))}
          </ul>
        </>
      ) : null}
      {r.options ? (
        <ul className="admin-inbox__bars">
          {r.options.map((o) => (
            <Bar key={o.label} label={o.label} count={o.count} total={r.count} />
          ))}
        </ul>
      ) : null}
      {r.texts ? (
        r.texts.length ? (
          <ul className="admin-inbox__texts">
            {r.texts.map((t, i) => (
              <li key={i}>
                <p>{t.text}</p>
                <small className="muted">
                  {t.client_name || who} · {formatDateTimeRu(t.at)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Пока никто не написал.</p>
        )
      ) : null}
    </section>
  )
}

/** Итоги рассылки: охват, ответы по вопросам, кто ответил. */
export function AdminInboxResults({ id, onBack, onChanged }) {
  const { data, busy, error, reload } = useAdminInboxDetail(id)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const c = data?.campaign
  const who = c?.audience === 'staff' ? 'Сотрудник' : 'Клиент'

  const close = async () => {
    if (!window.confirm('Закрыть опрос? Новые ответы больше не примем.')) return
    setClosing(true)
    setCloseError('')
    try {
      await closeInboxCampaign(id)
      reload()
      onChanged?.()
    } catch (e) {
      setCloseError(e?.message || 'Не удалось закрыть')
    } finally {
      setClosing(false)
    }
  }

  return (
    <section className="admin-inbox__detail" aria-label="Итоги рассылки">
      <div className="admin-inbox__toolbar">
        <button type="button" className="btn btn-ghost btn-touch" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
          Все рассылки
        </button>
        <span className="admin-inbox__toolbar-end">
          {data?.can_close && c?.open ? (
            <button type="button" className="btn btn-secondary btn-touch" onClick={() => void close()} disabled={closing}>
              <Lock size={16} aria-hidden />
              Закрыть опрос
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-icon-square btn-touch"
            onClick={reload}
            disabled={busy}
            title="Обновить"
            aria-label="Обновить"
          >
            <RefreshCw size={18} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
        </span>
      </div>
      {error || closeError ? (
        <p className="admin-inbox__error" role="alert">
          {error || closeError}
        </p>
      ) : null}
      {!c ? (
        busy ? (
          <p className="muted" role="status">
            Загружаю итоги…
          </p>
        ) : null
      ) : (
        <>
          <header className="card admin-inbox__summary">
            <small className="muted">
              {inboxStatusLabelRu(c)} · отправлено {formatDateTimeRu(c.created_at)} · {inboxRecipientsLabelRu(c)}
              {c.kind === 'survey' && (c.closed_at || !c.trigger) ? ` · до ${formatDateTimeRu(c.closed_at || c.expires_at)}` : ''}
            </small>
            <h2 className="admin-inbox__form-title">{c.title}</h2>
            {c.body ? <p className="admin-inbox__body">{c.body}</p> : null}
            <p className="admin-inbox__stats">{inboxStatsLineRu(c.kind, c.stats)}</p>
          </header>
          {data.results.map((r, i) => (
            <QuestionResult key={r.id} r={r} index={i} who={who} />
          ))}
          {c.kind === 'survey' ? (
            <section className="card admin-inbox__result">
              <h3 className="admin-inbox__result-title">Ответили · {data.respondents.length}</h3>
              {data.respondents.length ? (
                <ul className="admin-inbox__respondents">
                  {data.respondents.map((p, i) => (
                    <li key={i}>
                      <span>{p.client_name || who}</span>
                      <small className="muted">{formatDateTimeRu(p.answered_at)}</small>
                      {p.reward_points > 0 ? <small className="admin-inbox__reward">+{p.reward_points}</small> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Пока никто не ответил.</p>
              )}
            </section>
          ) : null}
        </>
      )}
    </section>
  )
}
