import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Gauge, TrendingUp, UserX } from 'lucide-react'

const ID_ICON = {
  'sales-report': TrendingUp,
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
 * }} props
 */
export function AdminHomeSoftSignalGlance({
  id = '',
  title,
  subtitle = '',
  href,
  tone = 'neutral',
  compact = false,
}) {
  const Icon = ID_ICON[id] || (tone === 'warn' ? AlertTriangle : TrendingUp)

  return (
    <Link
      to={href}
      className={`admin-home-soft-signal u-no-decoration${compact ? ' admin-home-soft-signal--compact' : ''}${tone === 'warn' ? ' admin-home-soft-signal--warn' : ''}${tone === 'hot' ? ' admin-home-soft-signal--hot' : ''}`}
      title={subtitle ? `${title}: ${subtitle}` : title}
    >
      <span className="admin-home-soft-signal__icon" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="admin-home-soft-signal__text">
        <span className="admin-home-soft-signal__title">{title}</span>
        {subtitle ? <span className="admin-home-soft-signal__sub muted">{subtitle}</span> : null}
      </span>
      <span className="admin-home-soft-signal__cta muted">Открыть</span>
    </Link>
  )
}
