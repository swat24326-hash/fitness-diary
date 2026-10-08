import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, RefreshCw, WifiOff } from 'lucide-react'
import { InboxSurveyForm } from '../../components/inbox/InboxSurveyForm.jsx'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { inboxItemMetaRu, inboxThanksRu } from '../../lib/client/clientInboxUiCore.js'
import { useStaffInboxItem } from './useStaffInbox.js'

/** /messages/:id — объявление целиком или опрос (форма → «Спасибо»). */
export function StaffInboxItemPage() {
  const { id = '' } = useParams()
  const { item, status, error, reload, answer, sending, sendError } = useStaffInboxItem(id)
  const back = (
    <Link to="/messages" className="btn btn-ghost btn-touch staff-inbox__back">
      <ArrowLeft size={18} aria-hidden />
      Все сообщения
    </Link>
  )

  if (!item) {
    return (
      <div className="staff-inbox">
        {back}
        <div className="card staff-inbox__status" role="status">
          {status === 'error' ? (
            <>
              <WifiOff size={28} aria-hidden />
              <strong>Не открылось</strong>
              <p className="muted">{error}</p>
              <button type="button" className="btn btn-secondary btn-touch" onClick={reload}>
                Повторить
              </button>
            </>
          ) : (
            <>
              <RefreshCw size={28} aria-hidden className="icon-spin" />
              <strong>Открываем…</strong>
            </>
          )}
        </div>
      </div>
    )
  }

  const survey = item.kind === 'survey'
  return (
    <div className="staff-inbox staff-inbox--item">
      {back}
      <header className="staff-inbox__item-head">
        <small className="muted">
          {inboxItemMetaRu(item)} · {formatDateTimeRu(item.sent_at)}
        </small>
        <h1 className="staff-inbox__title">{item.title}</h1>
      </header>
      {item.body ? <p className="card staff-inbox__body">{item.body}</p> : null}
      {survey && item.status === 'answered' ? (
        <p className="card staff-inbox__done" role="status">
          <CheckCircle2 size={22} aria-hidden />
          {inboxThanksRu(item)}
        </p>
      ) : null}
      {survey && item.status !== 'answered' && !item.open ? (
        <div className="card staff-inbox__status" role="status">
          <Lock size={28} aria-hidden />
          <strong>Опрос закрыт</strong>
          <p className="muted">Срок ответа вышел.</p>
        </div>
      ) : null}
      {survey && (item.status === 'answered' || item.open) ? (
        <InboxSurveyForm
          key={item.status}
          questions={item.questions ?? []}
          initial={item.answers}
          readOnly={item.status === 'answered'}
          sending={sending}
          error={sendError}
          onSubmit={(a) => void answer(a)}
          cardClass="card"
        />
      ) : null}
    </div>
  )
}
