import { useEffect, useId, useState } from 'react'
import { CheckCheck, Clock, RefreshCw, X } from 'lucide-react'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { staffGroupSeenRu } from '../../lib/chat/staffGroupPinCore.js'
import '../../styles/chat-group.css'

function People({ title, icon: Icon, people, dim = false }) {
  if (!people.length) return null
  return (
    <section className="staff-readers__section" aria-label={title}>
      <h3 className="staff-readers__head">
        <Icon size={16} aria-hidden />
        {title} · {people.length}
      </h3>
      <ul className="staff-readers__list">
        {people.map((p) => (
          <li key={p.id} className={`staff-readers__person${dim ? ' is-dim' : ''}`}>
            <span className="chat-row__avatar chat-row__avatar--staff" aria-hidden>
              {chatInitials(p.name)}
            </span>
            {p.name}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * «Кто прочитал» своё сообщение в чате клуба: прочитали и ещё не открыли (управляющей — кому напомнить).
 * @param {{ messageId: string|null, load: (id: string) => Promise<{ read: object[], unread: object[] }>, onClose: () => void }} props
 */
export function StaffGroupReadersSheet({ messageId, load, onClose }) {
  const titleId = useId()
  const [state, setState] = useState({ id: null, data: null, error: '' })

  useEffect(() => {
    if (!messageId) return undefined
    let alive = true
    load(messageId).then(
      (data) => alive && setState({ id: messageId, data, error: '' }),
      (e) => alive && setState({ id: messageId, data: null, error: e?.message || 'Не загрузилось — проверьте интернет' }),
    )
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
    }
  }, [messageId, load, onClose])

  if (!messageId) return null
  const current = state.id === messageId ? state : { data: null, error: '' }
  const data = current.data
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="modal-panel staff-readers" onClick={(e) => e.stopPropagation()} data-testid="group-readers">
        <header className="staff-readers__top">
          <h2 id={titleId} className="section-title">
            {data ? staffGroupSeenRu({ seen: data.read.length, total: data.read.length + data.unread.length }) : 'Кто прочитал'}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={onClose} aria-label="Закрыть" autoFocus>
            <X size={20} aria-hidden />
          </button>
        </header>
        {data ? (
          <>
            <People title="Прочитали" icon={CheckCheck} people={data.read} />
            <People title="Ещё не прочитали" icon={Clock} people={data.unread} dim />
          </>
        ) : (
          <p className="muted staff-readers__status" role="status">
            {current.error || (
              <>
                <RefreshCw size={16} aria-hidden className="icon-spin" /> Загружаем…
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
