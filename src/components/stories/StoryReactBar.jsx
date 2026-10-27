import { STORY_REACTIONS } from '../../lib/stories/storyClubCore.js'

/** Полоска реакций под сторис — как в Telegram, без лички. */
export function StoryReactBar({ mine, onPick, busy }) {
  return (
    <div className="stories-view__react" role="group" aria-label="Реакция на сторис">
      {STORY_REACTIONS.map((emoji) => {
        const on = mine === emoji
        return (
          <button
            key={emoji}
            type="button"
            className={`stories-view__react-btn btn-touch${on ? ' is-on' : ''}`}
            disabled={busy}
            aria-pressed={on}
            aria-label={on ? `Убрать ${emoji}` : `Поставить ${emoji}`}
            onClick={() => onPick(emoji)}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
