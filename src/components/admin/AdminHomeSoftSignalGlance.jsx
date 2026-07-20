import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Gauge, UserX } from 'lucide-react'

const ID_ICON = {
  'coach-quality': Gauge,
  inactive: UserX,
  expiring: Clock,
}

/**
 * Компактный сигнал в слоте ряда «внимание».
 *
 * @param {{
 *   id?: string,
 *   title: string,
 *   subtitle?: string,
 *   href: string,
 *   tone?: 'warn' | 'hot' | 'neutral',
 *   compact?: boolean,
 *   scorePct?: number | null,
 * }} props
 */
export function AdminHomeSoftSignalGlance({
  id = '',
  title,
  subtitle = '',
  href,
  tone = 'neutral',
  compact = false,
  scorePct = null,
}) {
  const Icon = ID_ICON[id] || (tone === 'warn' ? AlertTriangle : Gauge)
  const showScore = id === 'coach-quality' && scorePct != null && Number.isFinite(Number(scorePct))

  return (
    <Link
      to={href}
      className={`admin-home-soft-signal u-no-decoration${compact ? ' admin-home-soft-signal--compact' : ''}${tone === 'warn' ? ' admin-home-soft-signal--warn' : ''}${tone === 'hot' ? ' admin-home-soft-signal--hot' : ''}${showScore ? ' admin-home-soft-signal--score' : ''}`}
      title={
        showScore
          ? `${title}: ${Math.round(Number(scorePct))}/100`
          : subtitle
            ? `${title}: ${subtitle}`
            : title
      }
    >
      <span className="admin-home-soft-signal__head">
        <span className="admin-home-soft-signal__title">{title}</span>
        <span className="admin-home-soft-signal__icon" aria-hidden>
          <Icon size={18} />
        </span>
      </span>
      {showScore ? (
        <span className="admin-home-soft-signal__score">
          <span className="admin-home-soft-signal__score-value">{Math.round(Number(scorePct))}</span>
          <span className="admin-home-soft-signal__score-suffix muted">/100</span>
        </span>
      ) : subtitle ? (
        <span className="admin-home-soft-signal__sub muted">{subtitle}</span>
      ) : null}
      <span className="admin-home-soft-signal__cta muted">Открыть</span>
    </Link>
  )
}
