import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MessageCircle, Phone, X } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import { membershipUsageLabel } from '../../lib/membershipRules.js'
import { COACH_MEMBERSHIP_PHASE_RU, coachMembershipPhase, coachTelHref } from '../../lib/coach/coachClientsListCore.js'

/** Шторка клиента на телефоне: все абонементы (только просмотр), позвонить, написать в приложении. */
export function CoachClientSheet({ client, memList, today, onClose }) {
  useEffect(() => {
    if (!client) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client, onClose])

  if (!client) return null
  const tel = coachTelHref(client.phone)

  return createPortal(
    <div className="coach-sheet" onClick={onClose}>
      <section
        className="coach-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Абонементы: ${client.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="coach-sheet__head">
          <div className="coach-sheet__who">
            <h2 className="coach-sheet__name">{client.name}</h2>
            <span className="muted">{client.phone || 'Телефона нет'}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-icon-square" onClick={onClose} aria-label="Закрыть">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="coach-sheet__actions">
          {tel ? (
            <a className="btn btn-primary btn-touch" href={tel}>
              <Phone size={18} aria-hidden /> Позвонить
            </a>
          ) : null}
          <Link className="btn btn-secondary btn-touch" to={`/coach/chat/${client.id}`}>
            <MessageCircle size={18} aria-hidden /> Написать
          </Link>
        </div>

        {memList.length ? (
          <ul className="coach-sheet__mems" aria-label="Абонементы">
            {memList.map((m) => {
              const phase = coachMembershipPhase(m, memList, today)
              return (
                <li key={m.id} className={`coach-mem coach-mem--${phase}`}>
                  <div className="coach-mem__top">
                    <strong>{m.type_name || 'Абонемент'}</strong>
                    <span className="coach-mem__phase">{COACH_MEMBERSHIP_PHASE_RU[phase]}</span>
                  </div>
                  <span className="muted">
                    {formatDateRu(m.start_date)} – {formatDateRu(m.end_date)} · использовано {membershipUsageLabel(m, [])}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">Абонементов нет.</p>
        )}
      </section>
    </div>,
    document.body,
  )
}
