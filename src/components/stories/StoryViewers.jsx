import { useEffect, useId } from 'react'
import { Eye } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { chatInitials } from '../../lib/chat/chatUiCore.js'

const SIDE = { client: 'клиент', staff: 'сотрудник' }

/** Короткое время как в Telegram: сегодня — только часы, иначе дата. */
function seenShortRu(iso) {
  if (!iso) return ''
  const full = formatDateTimeRu(iso)
  if (full === '—') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return full
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    const time = full.split(', ')[1]
    return time || full
  }
  return full.replace(/,\s*/, ' · ')
}

/**
 * Кто открыл эту акцию — нижний sheet как у зрителей сторис в Telegram.
 * Список есть только у того, кто может её выкладывать.
 */
export function StoryViewers({ viewers, open, onToggle }) {
  const titleId = useId()
  const list = Array.isArray(viewers) ? viewers : null
  const count = list?.length ?? 0
  const canShow = list != null

  useEffect(() => {
    if (!open || !canShow) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onToggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onToggle, canShow])

  if (!canShow) return null
  const label = count ? `Посмотрели · ${count}` : 'Посмотрели'

  return (
    <div className="stories-view__people">
      {!open ? (
        <button
          type="button"
          className="stories-view__who-open btn-touch"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls={titleId}
        >
          <Eye size={18} aria-hidden />
          <span>{count ? `Кто смотрел · ${count}` : 'Кто смотрел'}</span>
        </button>
      ) : null}

      {open ? (
        <div className="stories-view__who-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button
            type="button"
            className="stories-view__who-scrim"
            onClick={onToggle}
            aria-label="Скрыть список"
          />
          <div className="stories-view__who-panel">
            <button
              type="button"
              className="stories-view__who-handle btn-touch"
              onClick={onToggle}
              aria-expanded={true}
              aria-label="Скрыть список"
            >
              <span className="stories-view__who-grip" aria-hidden />
            </button>
            <h2 id={titleId} className="stories-view__who-title">
              {label}
            </h2>
            {count ? (
              <ul className="stories-view__who">
                {list.map((person) => (
                  <li key={`${person.side}:${person.name}:${person.seen_at}`}>
                    <span
                      className={`stories-view__who-avatar${person.side === 'staff' ? ' is-staff' : ''}`}
                      aria-hidden
                    >
                      {chatInitials(person.name) || '?'}
                    </span>
                    <span className="stories-view__who-main">
                      <span className="stories-view__who-name">{person.name}</span>
                      <small>{SIDE[person.side] ?? ''}</small>
                    </span>
                    {person.reaction ? (
                      <span className="stories-view__who-react" aria-hidden>
                        {person.reaction}
                      </span>
                    ) : null}
                    <time dateTime={person.seen_at || undefined} title={formatDateTimeRu(person.seen_at)}>
                      {seenShortRu(person.seen_at)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stories-view__status">Пока никто не смотрел</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
