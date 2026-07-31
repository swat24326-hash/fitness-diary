/**
 * Переключатель зала на вкладке Прайс: ПЗ | ТЗ.
 * Стиль — те же mode-btn, что у режимов базовой/дневной сетки ПЗ.
 */

import { useState } from 'react'
import { AdminPriceListSection } from './AdminPriceListSection.jsx'
import { AdminTzPriceListSection } from './AdminTzPriceListSection.jsx'
import '../../styles/price-list.css'
import '../../styles/tz-price-list.css'

/**
 * @param {{ clubId: string, membershipTypes?: object[] }} props
 */
export function PriceListHallShell({ clubId, membershipTypes = [] }) {
  const [hall, setHall] = useState(/** @type {'pz' | 'tz'} */ ('pz'))

  return (
    <div className="price-list-hall">
      <div className="price-list__toolbar price-list-hall__toolbar" role="presentation">
        <div className="price-list__mode" role="tablist" aria-label="Зал прайса">
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${hall === 'pz' ? ' is-active' : ''}`}
            aria-selected={hall === 'pz'}
            onClick={() => setHall('pz')}
          >
            Персональный зал
          </button>
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${hall === 'tz' ? ' is-active' : ''}`}
            aria-selected={hall === 'tz'}
            onClick={() => setHall('tz')}
          >
            Тренажёрный зал
          </button>
        </div>
      </div>
      {hall === 'tz' ? (
        <AdminTzPriceListSection clubId={clubId} />
      ) : (
        <AdminPriceListSection clubId={clubId} membershipTypes={membershipTypes} />
      )}
    </div>
  )
}
