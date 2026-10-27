import { useEffect, useState } from 'react'
import { STORY_REACTIONS } from '../../lib/stories/storyClubCore.js'

/** Полоска реакций под сторис — как в Telegram: по центру круга + pop при тапе. */
export function StoryReactBar({ mine, onPick, busy }) {
  const [pop, setPop] = useState(null)

  useEffect(() => {
    if (!pop) return undefined
    const t = window.setTimeout(() => setPop(null), 520)
    return () => window.clearTimeout(t)
  }, [pop])

  return (
    <div className="stories-view__react" role="group" aria-label="Реакция на сторис">
      {STORY_REACTIONS.map((emoji) => {
        const on = mine === emoji
        const popping = pop === emoji
        return (
          <button
            key={emoji}
            type="button"
            className={`stories-view__react-btn btn-touch${on ? ' is-on' : ''}${popping ? ' is-pop' : ''}`}
            disabled={busy}
            aria-pressed={on}
            aria-label={on ? `Убрать ${emoji}` : `Поставить ${emoji}`}
            onClick={() => {
              setPop(emoji)
              onPick(emoji)
            }}
          >
            <span className="stories-view__react-emoji" aria-hidden>
              {emoji}
            </span>
            {popping ? (
              <span className="stories-view__react-burst" aria-hidden>
                {emoji}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
