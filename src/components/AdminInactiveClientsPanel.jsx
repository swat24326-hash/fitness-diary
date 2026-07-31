import { Link } from 'react-router-dom'
import { UserCircle } from 'lucide-react'
import { formatIsoRu } from '../lib/period'
import { formatInactiveClientListLabel } from '../lib/membershipRules'

/**
 * @param {{
 *   clients: Array<{ id: string, name: string, phone?: string|null, trainerId?: string|null, inactiveReason?: string, inactiveDetail?: string }>,
 *   dateFrom: string,
 *   dateTo: string,
 *   clubId?: string,
 *   clientLinkTo?: (clientId: string) => string,
 *   scopeLabel?: 'club' | 'trainer',
 *   trainerNameById?: Record<string, string>,
 * }} props
 */
export function AdminInactiveClientsPanel({
  clients,
  dateFrom,
  dateTo,
  clubId = '',
  clientLinkTo,
  scopeLabel = 'club',
  trainerNameById = {},
}) {
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const linkFor = clientLinkTo ?? ((id) => `/admin/clients/${id}${clubQs}`)

  const trainerLabel = (trainerId) => {
    const tid = String(trainerId ?? '').trim()
    if (!tid) return '—'
    return trainerNameById[tid]?.trim() || (tid.length > 10 ? `${tid.slice(0, 8)}…` : tid)
  }

  return (
    <>
      <p className="muted admin-stat-drilldown__hint" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
        {scopeLabel === 'trainer' ? 'Ваши клиенты' : 'Клиенты клуба'}, у которых в выбранном периоде нет абонемента, по которому
        можно провести тренировку (на сегодня, если период текущий; иначе — с учётом последнего дня действия абонемента в
        периоде): закончились тренировки, истёк срок или абонемента нет. Клиенты с купленным абонементом «ждёт старт» сюда не
        входят. Период сводки: {formatIsoRu(dateFrom)} — {formatIsoRu(dateTo)}.
      </p>

      {clients.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Нет клиентов в этой категории на конец выбранного периода.
        </p>
      ) : (
        <ul className="list admin-stat-drilldown__list">
          {clients.map((c) => {
            const reasonLabel = formatInactiveClientListLabel(c)
            const trainerName = scopeLabel === 'club' ? trainerLabel(c.trainerId) : null
            const metaParts = []
            if (reasonLabel) metaParts.push(reasonLabel)
            if (trainerName != null) metaParts.push(`Тренер: ${trainerName}`)
            if (c.phone) metaParts.push(c.phone)
            return (
              <li key={c.id} className="list-item admin-stat-drilldown__row">
                <div className="admin-stat-drilldown__info">
                  <strong>{c.name}</strong>
                  <div className="muted admin-stat-drilldown__meta">
                    {metaParts.length > 0 ? <span>{metaParts.join(' · ')}</span> : null}
                  </div>
                </div>
                <Link
                  to={linkFor(c.id)}
                  className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                  aria-label="Карточка клиента"
                  title="Карточка клиента"
                >
                  <UserCircle size={20} aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
