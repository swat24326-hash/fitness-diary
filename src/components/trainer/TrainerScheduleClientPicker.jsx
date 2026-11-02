import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { formatScheduleClientCardMeta } from '../../lib/trainer/trainerScheduleClientInfoCore.js'
import { SCHEDULE_MAX_CLIENTS, buildTrainerScheduleClientPickerList } from '../../lib/trainer/trainerScheduleCore.js'

/**
 * Выбор клиентов слота: чипы выбранных + поиск + список с галочками.
 * @param {{
 *   clients: object[],
 *   selectedIds: string[],
 *   onToggle: (id: string) => void,
 *   clientInfoById?: Record<string, { cardNumber?: string, membershipLabel?: string }>,
 *   onSearchFocus?: () => void,
 * }} props
 */
export function TrainerScheduleClientPicker({ clients, selectedIds, onToggle, clientInfoById = {}, onSearchFocus }) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map((clients ?? []).map((c) => [String(c.id), c])), [clients])
  const selectedRows = useMemo(
    () => selectedIds.map((id) => byId.get(String(id))).filter(Boolean),
    [byId, selectedIds],
  )
  const picker = useMemo(
    () => buildTrainerScheduleClientPickerList(clients, query, selectedIds),
    [clients, query, selectedIds],
  )
  const full = selectedIds.length >= SCHEDULE_MAX_CLIENTS

  return (
    <div className="trainer-schedule-modal__clients-wrap">
      {selectedIds.length ? (
        <p className="trainer-schedule-modal__hint muted" data-testid="schedule-clients-count">
          {`Выбрано ${selectedIds.length} из ${SCHEDULE_MAX_CLIENTS}${full ? ' — больше нельзя' : ''}`}
        </p>
      ) : (
        <p className="sr-only" data-testid="schedule-clients-count">
          Клиенты не выбраны
        </p>
      )}
      {selectedRows.length ? (
        <ul className="trainer-schedule-modal__selected" aria-label="Уже выбраны">
          {selectedRows.map((c) => (
            <li key={String(c.id)}>
              <button
                type="button"
                className="trainer-schedule-modal__selected-chip btn-touch"
                onClick={() => onToggle(String(c.id))}
                aria-label={`Убрать ${c.name || 'клиента'}`}
                title="Убрать"
              >
                <span className="trainer-schedule-modal__selected-name">{c.name || 'Без имени'}</span>
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="trainer-schedule-modal__search admin-clients-search-cell" role="search">
        <Search size={18} aria-hidden className="muted u-shrink-0" />
        <input
          className="admin-clients-search-input"
          type="search"
          autoComplete="off"
          placeholder="Фамилия, телефон или номер карты…"
          aria-label="Поиск клиента"
          data-testid="schedule-clients-search"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          onFocus={() => onSearchFocus?.()}
        />
      </div>
      <div className="trainer-schedule-modal__clients">
        <ul className="trainer-schedule-modal__client-list">
          {picker.map((c) => {
            const id = String(c.id)
            const checked = selectedIds.includes(id)
            const meta = formatScheduleClientCardMeta(clientInfoById[id] ?? {})
            return (
              <li key={id}>
                <label className="trainer-schedule-modal__client-item">
                  <input type="checkbox" checked={checked} disabled={full && !checked} onChange={() => onToggle(id)} />
                  <span className="trainer-schedule-modal__client-text">
                    <span className="trainer-schedule-modal__client-name">{c.name}</span>
                    {meta ? <span className="trainer-schedule-modal__client-meta muted">{meta}</span> : null}
                  </span>
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
