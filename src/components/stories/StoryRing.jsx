import { storyRingSegments } from '../../lib/stories/storyClubCore.js'

const R = 34
const C = 2 * Math.PI * R

/** Кольцо кружка: дуга на каждое фото, яркая пока сторис не смотрели. */
export function StoryRing({ stories }) {
  const segments = storyRingSegments(stories)
  return (
    <svg className="stories-rail__ring" viewBox="0 0 76 76" aria-hidden>
      {segments.map((seg) => (
        <circle
          key={seg.id}
          cx="38"
          cy="38"
          r={R}
          fill="none"
          data-seen={seg.seen ? '1' : '0'}
          strokeDasharray={`${seg.sweep * C} ${C}`}
          strokeDashoffset={-seg.start * C}
          transform="rotate(-90 38 38)"
        />
      ))}
    </svg>
  )
}
