import { Link } from 'react-router-dom'
import { Check, UserCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { formatDateRu } from '../lib/dateRu.js'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { HALL_RENEWALS_HALLS } from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'
import { buildClientCardDeepLink } from '../lib/admin/staffTaskDeepLinkCore.js'

const HALL_LABEL = Object.fromEntries(HALL_RENEWALS_HALLS.map((h) => [h.hall, h.label]))

/**
 * @param {number|null|undefined} fact
 * @param {number} orient
 */
function formatFactDelta(fact, orient) {
  if (fact == null || !(orient > 0)) return ''
  const d = Math.round(fact - orient)
  if (d === 0) return ' · как ориентир'
  if (d > 0) return ` · +${formatRub(d)}`
  return ` · −${formatRub(Math.abs(d))}`
}

/**
 * @param {{
 *   endings: object[],
 *   clubId?: string,
 * }} props
 */
export function SalesStrategyPlaybookClosingsList({ endings = [], clubId = '' }) {
  const { isAdmin, isSalesManager } = useAuth()

  if (!endings.length) {
    return (
      <p className="sales-playbook__empty muted" role="status">
        На этой неделе закрытий нет — фокус на НК и УК.
      </p>
    )
  }

  return (
    <ul className="sales-playbook__closings" aria-label="Закрытия недели">
      {endings.map((row) => {
        const href = row.clientId
          ? buildClientCardDeepLink(row.clientId, {
              clubId,
              forAdmin: Boolean(isAdmin),
              forSales: Boolean(isSalesManager) && !isAdmin,
              from: 'strategy',
            })
          : ''
        const phone = String(row.phone ?? '').trim()
        const card = String(row.cardNumber ?? '').trim()
        const confirmed = Boolean(row.confirmed)
        const fact =
          row.factAmount == null || row.factAmount === ''
            ? null
            : Number(row.factAmount)
        const factOk = fact != null && Number.isFinite(fact) && fact > 0
        const orient = Number(row.amount) || 0
        return (
          <li
            key={`${row.clientId}-${row.endDate}-${row.hall}`}
            className={`sales-playbook__closing${confirmed ? ' is-confirmed' : ''}`}
          >
            <span className="sales-playbook__closing-hall">{HALL_LABEL[row.hall] || row.hall}</span>
            <div className="sales-playbook__closing-main">
              <span className="sales-playbook__closing-name">
                {confirmed ? (
                  <Check
                    size={16}
                    className="sales-playbook__closing-check"
                    aria-label="Купил"
                    title="Уже купил следующий абон"
                  />
                ) : null}
                {row.clientName}
              </span>
              <span className="sales-playbook__closing-meta muted">
                {card ? <>карта {card}</> : <>карта —</>}
                {' · '}
                {phone || 'нет телефона'}
              </span>
              {confirmed ? (
                <span className="sales-playbook__closing-fact muted">
                  {factOk ? (
                    <>
                      факт {formatRub(fact)}
                      {formatFactDelta(fact, orient)}
                    </>
                  ) : (
                    <>факт —</>
                  )}
                </span>
              ) : null}
            </div>
            <span className="sales-playbook__closing-date muted">{formatDateRu(row.endDate)}</span>
            <span className="sales-playbook__closing-rub" title={confirmed ? 'Ориентир чека' : undefined}>
              {orient > 0 ? formatRub(orient) : confirmed ? '—' : formatRub(0)}
            </span>
            {href ? (
              <Link
                to={href}
                className="btn btn-primary btn-icon-square btn-touch u-no-decoration sales-playbook__closing-open"
                aria-label="Карточка клиента"
                title="Карточка клиента"
              >
                <UserCircle size={20} aria-hidden />
              </Link>
            ) : (
              <span className="sales-playbook__closing-open-placeholder" aria-hidden />
            )}
          </li>
        )
      })}
    </ul>
  )
}
