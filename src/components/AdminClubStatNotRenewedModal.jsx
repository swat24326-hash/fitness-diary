import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { formatDateRu } from '../lib/dateRu'
import { formatIsoRu } from '../lib/period'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clients: Array<{ id: string, name: string, phone?: string|null, membershipEnded?: string|null }>,
 *   dateFrom: string,
 *   dateTo: string,
 *   clubId: string,
 * }} props
 */
export function AdminClubStatNotRenewedModal({ open, onClose, clients, dateFrom, dateTo, clubId }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  return (
    <div className="modal-overlay admin-stat-drilldown" role="dialog" aria-modal="true" aria-labelledby="not-renewed-title" onClick={onClose}>
      <div className="modal-panel admin-stat-drilldown__panel" onClick={(e) => e.stopPropagation()}>
        <div className="row admin-stat-drilldown__head">
          <h3 id="not-renewed-title" style={{ margin: 0 }}>
            Не продлилось — {clients.length}
          </h3>
          <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Закрыть" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <p className="muted admin-stat-drilldown__hint">
          Абонемент <strong>закончился</strong> в периоде {formatIsoRu(dateFrom)} — {formatIsoRu(dateTo)}, а на{' '}
          <strong>конец периода</strong> действующего абонемента с остатком тренировок нет.
        </p>

        {clients.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Нет клиентов в этой категории за выбранный период.
          </p>
        ) : (
          <ul className="list admin-stat-drilldown__list">
            {clients.map((c) => (
              <li key={c.id} className="list-item admin-stat-drilldown__row">
                <div className="admin-stat-drilldown__info">
                  <strong>{c.name}</strong>
                  <div className="muted admin-stat-drilldown__meta">
                    {c.phone ? <span>{c.phone}</span> : null}
                    {c.membershipEnded ? (
                      <span>
                        {c.phone ? ' · ' : ''}
                        окончание абонемента: <strong>{formatDateRu(c.membershipEnded)}</strong>
                      </span>
                    ) : null}
                  </div>
                </div>
                <Link to={`/admin/clients/${c.id}${clubQs}`} className="btn btn-primary btn-touch u-no-decoration" onClick={onClose}>
                  Карточка
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
