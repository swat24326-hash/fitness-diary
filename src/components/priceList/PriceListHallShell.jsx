/**
 * Переключатель зала на вкладке Прайс: ПЗ | ТЗ | АЗ.
 */

import { useState } from 'react'
import { AdminPriceListSection } from './AdminPriceListSection.jsx'
import { AdminTzPriceListSection } from './AdminTzPriceListSection.jsx'
import { AdminAzPriceListSection } from './AdminAzPriceListSection.jsx'
import '../../styles/price-list.css'
import '../../styles/tz-price-list.css'
import '../../styles/az-price-list.css'

/**
 * @param {{ hall: 'pz' | 'tz' | 'az', onHallChange: (hall: 'pz' | 'tz' | 'az') => void }} props
 */
function PriceListHallTabs({ hall, onHallChange }) {
  return (
    <div className="tabs price-list-hall__tabs" role="tablist" aria-label="Зал прайса">
      <button
        type="button"
        role="tab"
        className="tab"
        aria-selected={hall === 'pz'}
        onClick={() => onHallChange('pz')}
      >
        Персональный зал
      </button>
      <button
        type="button"
        role="tab"
        className="tab"
        aria-selected={hall === 'tz'}
        onClick={() => onHallChange('tz')}
      >
        Тренажёрный зал
      </button>
      <button
        type="button"
        role="tab"
        className="tab"
        aria-selected={hall === 'az'}
        onClick={() => onHallChange('az')}
      >
        Аэробный зал
      </button>
    </div>
  )
}

/**
 * @param {{ clubId: string, membershipTypes?: object[] }} props
 */
export function PriceListHallShell({ clubId, membershipTypes = [] }) {
  const [hall, setHall] = useState(/** @type {'pz' | 'tz' | 'az'} */ ('pz'))
  const hallTabs = <PriceListHallTabs hall={hall} onHallChange={setHall} />

  if (hall === 'tz') {
    return <AdminTzPriceListSection clubId={clubId} hallTabs={hallTabs} />
  }
  if (hall === 'az') {
    return <AdminAzPriceListSection clubId={clubId} hallTabs={hallTabs} />
  }
  return (
    <AdminPriceListSection
      clubId={clubId}
      membershipTypes={membershipTypes}
      hallTabs={hallTabs}
    />
  )
}
