/**
 * Чипы направлений на вкладке АЗ (Клиенты).
 */

import '../../styles/admin-clients-filters.css'

/**
 * @param {{
 *   options: Array<{ id: string, label: string, count: number }>,
 *   value: string,
 *   onChange: (id: string) => void,
 * }} props
 */
export function AdminClientsAzDirectionFilters({ options = [], value = '', onChange }) {
  if (!options.length) return null

  return (
    <section className="admin-clients-az-dirs" aria-label="Фильтр по направлениям АЗ">
      <h3 className="admin-clients-az-dirs__title">Направления</h3>
      <ul className="admin-clients-az-dirs__list" role="list">
        {options.map((opt) => {
          const active = String(value ?? '') === String(opt.id ?? '')
          return (
            <li key={opt.id || 'all'}>
              <button
                type="button"
                className={`admin-clients-az-dirs__chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onChange?.(opt.id)}
              >
                <span className="admin-clients-az-dirs__chip-label">{opt.label}</span>
                <span className="admin-clients-az-dirs__chip-count">{opt.count}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
