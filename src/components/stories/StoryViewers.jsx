import { formatDateTimeRu } from '../../lib/dateRu.js'

const SIDE = { client: 'клиент', staff: 'сотрудник' }

/** Кто открыл эту акцию. Список есть только у того, кто может её выкладывать. */
export function StoryViewers({ viewers, open, onToggle }) {
  if (!Array.isArray(viewers)) return null
  return (
    <div className="stories-view__people">
      <button type="button" className="btn btn-ghost btn-touch" onClick={onToggle} aria-expanded={open}>
        {open ? 'Скрыть' : `Кто смотрел${viewers.length ? ` · ${viewers.length}` : ''}`}
      </button>
      {open ? (
        viewers.length ? (
          <ul className="stories-view__who">
            {viewers.map((person) => (
              <li key={`${person.side}:${person.name}:${person.seen_at}`}>
                <span>
                  {person.name}
                  <small>{SIDE[person.side] ?? ''}</small>
                </span>
                <time dateTime={person.seen_at || undefined}>{formatDateTimeRu(person.seen_at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="stories-view__status">Пока никто не смотрел</p>
        )
      ) : null}
    </div>
  )
}
