import { Link } from 'react-router-dom'
import { formatIsoRu } from '../lib/period'

/**
 * @param {{
 *   clients: Array<{ id: string, name: string, phone?: string|null }>,
 *   dateFrom: string,
 *   dateTo: string,
 *   clubId?: string,
 *   clientLinkTo?: (clientId: string) => string,
 *   scopeLabel?: 'club' | 'trainer',
 * }} props
 */
export function AdminInactiveClientsPanel({ clients, dateFrom, dateTo, clubId = '', clientLinkTo, scopeLabel = 'club' }) {
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const linkFor = clientLinkTo ?? ((id) => `/admin/clients/${id}${clubQs}`)

  return (
    <>
      <p className="muted admin-stat-drilldown__hint" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
        {scopeLabel === 'trainer' ? 'Ваши клиенты, которые' : 'Клиенты клуба, которые'} на <strong>конец периода</strong> ({formatIsoRu(dateTo)}) не имеют
        действующего абонемента с остатком тренировок и не попали в «Не продлилось» в периоде {formatIsoRu(dateFrom)} — {formatIsoRu(dateTo)}.
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
                <div className="muted admin-stat-drilldown__meta">{c.phone ? <span>{c.phone}</span> : null}</div>
              </div>
              <Link to={linkFor(c.id)} className="btn btn-primary btn-touch u-no-decoration">
                Карточка
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

