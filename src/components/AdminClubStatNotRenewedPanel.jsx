import { Link } from 'react-router-dom'
import { formatDateRu } from '../lib/dateRu'
import { formatIsoRu } from '../lib/period'

/**
 * @param {{
 *   clients: Array<{ id: string, name: string, phone?: string|null, membershipEnded?: string|null }>,
 *   dateFrom: string,
 *   dateTo: string,
 *   clubId: string,
 * }} props
 */
export function AdminClubStatNotRenewedPanel({ clients, dateFrom, dateTo, clubId }) {
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  return (
    <>
      <p className="muted admin-stat-drilldown__hint" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
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
              <Link to={`/admin/clients/${c.id}${clubQs}`} className="btn btn-primary btn-touch u-no-decoration">
                Карточка
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
