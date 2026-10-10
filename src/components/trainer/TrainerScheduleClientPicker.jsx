import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { buildTrainerScheduleClientPickerList } from '../../lib/trainer/trainerScheduleCore.js'

/**
 * Выбор клиентов слота: поиск + список с галочками.
 * @param {{ clients: object[], selectedIds: string[], onToggle: (id: string) => void }} props
 */
export function TrainerScheduleClientPicker({ clients, selectedIds, onToggle }) {
  const [query, setQuery] = useState('')
  const picker = useMemo(
    () => buildTrainerScheduleClientPickerList(clients, query, selectedIds),
    [clients, query, selectedIds],
  )

  return (
    <div className="trainer-schedule-modal__clients-wrap">
      <p className="trainer-schedule-modal__hint muted">Можно выбрать несколько клиентов на один слот.</p>
      <div className="trainer-schedule-modal__search admin-clients-search-cell" role="search">
        <Search size={18} aria-hidden className="muted u-shrink-0" />
        <input
          className="admin-clients-search-input"
          type="search"
          autoComplete="off"
          placeholder="Фамилия, телефон или номер карты…"
          aria-label="Поиск клиента"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>
      <div className="trainer-schedule-modal__clients">
        <ul className="trainer-schedule-modal__client-list">
          {picker.map((c) => {
            const id = String(c.id)
            return (
              <li key={id}>
                <label className="trainer-schedule-modal__client-item">
                  <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => onToggle(id)} />
                  <span>{c.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
        {!clients.length ? (
          <p className="muted">Нет активных клиентов — добавьте заметку или клиента в базе.</p>
        ) : null}
        {clients.length && query.trim() && !picker.length ? (
          <p className="muted trainer-schedule-modal__clients-empty">Никого не найдено — измените запрос.</p>
        ) : null}
      </div>
    </div>
  )
}
