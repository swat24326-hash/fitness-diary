import { formatDateRu } from '../../lib/dateRu.js'
import { weightSparkPoints } from '../../lib/client/clientMeHighlightsCore.js'

const W = 300
const H = 64

export function ClientWeightSpark({ weights }) {
  const points = weightSparkPoints(weights, W, H)
  if (!points) return null
  const first = weights[0]
  const last = weights.at(-1)
  return (
    <figure className="client-me-spark" aria-label={`График веса с ${formatDateRu(first.date)} по ${formatDateRu(last.date)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={points} />
      </svg>
      <figcaption className="client-me-spark__axis">
        <span>{formatDateRu(first.date)}</span>
        <span>{formatDateRu(last.date)}</span>
      </figcaption>
    </figure>
  )
}
