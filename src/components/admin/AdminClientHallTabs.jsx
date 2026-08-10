import {
  CLIENT_HALL_TAB_LABELS,
  CLIENT_HALL_TAB_ORDER,
} from '../../lib/admin/clientHallTabsCore.js'
import { clientMembershipHallSet } from '../../lib/membershipHallCore.js'

/**
 * Вкладки ПЗ / ТЗ / АЗ на карточке (admin / sales).
 * @param {{
 *   client: object,
 *   memberships?: object[],
 *   value: 'pz'|'tz'|'az',
 *   onChange: (hall: 'pz'|'tz'|'az') => void,
 * }} props
 */
export function AdminClientHallTabs({ client, memberships = [], value, onChange }) {
  const halls = clientMembershipHallSet(client, memberships)
  return (
    <div className="admin-client-hall-tabs" role="tablist" aria-label="Зал абонемента">
      {CLIENT_HALL_TAB_ORDER.map((hall) => {
        const active = value === hall
        const has = halls.has(hall)
        return (
          <button
            key={hall}
            type="button"
            role="tab"
            aria-selected={active}
            className={`admin-client-hall-tabs__btn${active ? ' is-active' : ''}${has ? '' : ' is-empty'}`}
            onClick={() => onChange(hall)}
          >
            {CLIENT_HALL_TAB_LABELS[hall]}
            {has ? <span className="admin-client-hall-tabs__dot" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}
