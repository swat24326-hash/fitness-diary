/**
 * Чипы направлений на вкладке АЗ (Клиенты).
 */

import '../../styles/admin-clients-filters.css'

/**
 * @param {{
 *   options: Array<{ id: string, label: string, count: number }>,
 *   value: string,
 *   onChange: (id: string) => void,
 *   mutedBySearch?: boolean,
 * }} props
 */
export function AdminClientsAzDirectionFilters({
  options = [],
  value = '',
  onChange,
  mutedBySearch = false,
}) {
  if (!options.length) return null

  return (
    <section
      className={`admin-clients-az-dirs${mutedBySearch ? ' admin-clients-az-dirs--muted' : ''}`}
      aria-label="Фильтр по направлениям АЗ"
      aria-disabled={mutedBySearch ? true : undefined}
    >
      <h3 className="admin-clients-az-dirs__title">
        Направления
        {mutedBySearch ? <span className="muted"> · по вкладке; клик выходит из поиска</span> : null}
      </h3>
      <ul className="admin-clients-az-dirs__list" role="list">
        {options.map((opt) => {
          const active = !mutedBySearch && String(value ?? '') === String(opt.id ?? '')
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
