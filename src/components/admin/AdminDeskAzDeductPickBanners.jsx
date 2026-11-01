import { formatDateRu } from '../../lib/dateRu.js'
import { deskAzDirectionLabel } from '../../lib/admin/deskMembershipLedgerCore.js'
import { formatDeskAzSessionUsageRu } from '../../lib/admin/deskAzSessionDeductCore.js'

/**
 * Баннеры выбора абона АЗ при списании из списка (2+ живых пакета).
 *
 * @param {{
 *   memberships: object[],
 *   azTypes?: Array<{ id?: string, name?: string, code?: string }>,
 *   onPick: (membership: object) => void,
 * }} props
 */
export function AdminDeskAzDeductPickBanners({ memberships, azTypes = [], onPick }) {
  const list = Array.isArray(memberships) ? memberships : []
  return (
    <div className="admin-desk-az-deduct-picks" role="listbox" aria-label="Выбор абонемента">
      {list.map((m) => {
        const id = String(m?.id ?? '')
        const direction = deskAzDirectionLabel(m?.membership_type_id, azTypes)
        const usage = formatDeskAzSessionUsageRu(m)
        const endRu = formatDateRu(m?.end_date)
        const title = direction && direction !== '—' ? direction : 'Абонемент АЗ'
        return (
          <button
            key={id || usage}
            type="button"
            role="option"
            className="admin-desk-az-deduct-pick btn-touch"
            onClick={() => onPick(m)}
          >
            <span className="admin-desk-az-deduct-pick__title">{title}</span>
            <span className="admin-desk-az-deduct-pick__meta">
              {usage}
              {endRu && endRu !== '—' ? ` · до ${endRu}` : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
