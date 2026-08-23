import { Link } from 'react-router-dom'
import { buildClientAttendanceStatsPath } from '../lib/clientCardTabsCore'
import { buildClientAttendanceGlance } from '../lib/clientAttendanceGlanceCore'

/**
 * @param {{
 *   client: object,
 *   memList: object[],
 *   trainings: object[],
 *   today: string,
 *   forAdmin?: boolean,
 * }} props
 */
export function ClientAttendanceGlanceChip({ client, memList, trainings, today, forAdmin = false }) {
  const glance = buildClientAttendanceGlance({ client, memList, trainings, today })
  if (!glance) return null

  const to = buildClientAttendanceStatsPath(client.id, { forAdmin })
  const toneClass =
    glance.tone === 'good'
      ? 'client-attendance-glance--good'
      : glance.tone === 'bad'
        ? 'client-attendance-glance--bad'
        : 'client-attendance-glance--warn'

  return (
    <Link
      to={to}
      className={`client-attendance-glance u-no-decoration ${toneClass}${glance.slip ? ' client-attendance-glance--slip' : ''}`}
      title="Посещаемость — статистика клиента"
      aria-label={`Посещаемость: ${glance.chipLabelRu}`}
    >
      {glance.chipLabelRu}
    </Link>
  )
}
