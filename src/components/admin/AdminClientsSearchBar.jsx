import { CreditCard, Phone, Search, UserSearch } from 'lucide-react'
import { normalizeAdminClientSearchMode } from '../../lib/admin/adminClientsCrossHallSearchCore.js'

/**
 * Строка поиска клиентов: фамилия всегда, номер — либо карта, либо телефон.
 * @param {{
 *   query: string,
 *   onQueryChange: (value: string) => void,
 *   mode: string,
 *   onModeChange: (mode: 'card' | 'phone') => void,
 *   showTrainerSearch?: boolean,
 *   trainerQuery?: string,
 *   onTrainerQueryChange?: (value: string) => void,
 * }} props
 */
export function AdminClientsSearchBar({
  query,
  onQueryChange,
  mode,
  onModeChange,
  showTrainerSearch = false,
  trainerQuery = '',
  onTrainerQueryChange,
}) {
  const phoneMode = normalizeAdminClientSearchMode(mode) === 'phone'
  return (
    <div className="admin-clients-workspace__search" role="group" aria-label="Поиск клиента и тренера">
      <div className="admin-clients-search-cell">
        <Search size={18} aria-hidden className="muted u-shrink-0" />
        <input
          className="admin-clients-search-input"
          type="search"
          autoComplete="off"
          placeholder={phoneMode ? 'Фамилия или телефон…' : 'Фамилия или номер карты…'}
          aria-label={phoneMode ? 'Поиск по фамилии или телефону' : 'Поиск по фамилии или номеру карты'}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="admin-clients-search-mode" role="group" aria-label="Что означает номер">
          <button
            type="button"
            className="admin-clients-search-mode__btn"
            aria-pressed={!phoneMode}
            title="Искать номер как карту"
            aria-label="Искать номер как карту"
            onClick={() => onModeChange('card')}
          >
            <CreditCard size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="admin-clients-search-mode__btn"
            aria-pressed={phoneMode}
            title="Искать номер как телефон"
            aria-label="Искать номер как телефон"
            onClick={() => onModeChange('phone')}
          >
            <Phone size={18} aria-hidden />
          </button>
        </div>
      </div>
      {!showTrainerSearch ? null : (
        <div className="admin-clients-search-cell">
          <UserSearch size={18} aria-hidden className="muted u-shrink-0" />
          <input
            className="admin-clients-search-input"
            type="search"
            autoComplete="off"
            placeholder="Тренер: ФИО…"
            aria-label="Поиск по закреплённому тренеру"
            value={trainerQuery}
            onChange={(e) => onTrainerQueryChange?.(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
