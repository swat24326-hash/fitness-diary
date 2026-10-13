import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { SCHEDULE_MAX_CLIENTS, buildTrainerScheduleClientPickerList } from '../../lib/trainer/trainerScheduleCore.js'

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
  const full = selectedIds.length >= SCHEDULE_MAX_CLIENTS

  return (
    <div className="trainer-schedule-modal__clients-wrap">
      <p className="trainer-schedule-modal__hint muted" data-testid="schedule-clients-count">
        {selectedIds.length
          ? `Выбрано ${selectedIds.length} из ${SCHEDULE_MAX_CLIENTS}${full ? ' — больше нельзя' : ''}`
          : `Можно выбрать до ${SCHEDULE_MAX_CLIENTS} клиентов на один слот.`}
      </p>
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
            const checked = selectedIds.includes(id)
            return (
              <li key={id}>
                <label className="trainer-schedule-modal__client-item">
                  <input type="checkbox" checked={checked} disabled={full && !checked} onChange={() => onToggle(id)} />
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
