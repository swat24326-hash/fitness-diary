import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, UserPlus } from 'lucide-react'
import { fetchPnkBundle } from '../../lib/pnk/pnkApiService.js'
import { buildPnkManagerHomeGlance } from '../../lib/pnk/pnkManagerHomeGlanceCore.js'
import '../../styles/pnk-funnel.css'

/**
 * ПНК на главной менеджера / админа — цифры и вход на доску контроля.
 * @param {{ clubId: string, href: string }} props
 */
export function ManagerPnkHomeGlance({ clubId = '', href = '/sales/pnk' }) {
  const [glance, setGlance] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const cid = String(clubId || '').trim()
    if (!cid) {
      setGlance(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchPnkBundle({ clubId: cid })
      setGlance(buildPnkManagerHomeGlance(data?.clients ?? []))
    } catch {
      setGlance(null)
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!String(clubId || '').trim()) return null
  if (loading && !glance) {
    return (
      <Link to={href} className="pnk-home-glance u-no-decoration pnk-home-glance--loading">
        <span className="pnk-home-glance__icon" aria-hidden>
          <UserPlus size={28} />
        </span>
        <span className="pnk-home-glance__body">
          <span className="pnk-home-glance__title">ПНК</span>
          <span className="pnk-home-glance__meta muted">Загрузка…</span>
        </span>
        <ChevronRight size={22} className="pnk-home-glance__chevron" aria-hidden />
      </Link>
    )
  }

  const openCount = glance?.openCount ?? 0
  const attentionCount = glance?.attentionCount ?? 0
  const isHot = Boolean(glance?.isHot)
  const meta =
    openCount === 0
      ? 'Нет открытых карточек — открыть доску'
      : attentionCount > 0
        ? `${openCount} в работе · ${attentionCount} требуют внимания`
        : `${openCount} в работе`

  return (
    <Link
      to={href}
      className={`pnk-home-glance u-no-decoration${isHot ? ' pnk-home-glance--hot' : ''}`}
      aria-label={`ПНК: ${meta}`}
    >
      <span className="pnk-home-glance__icon" aria-hidden>
        <UserPlus size={28} />
      </span>
      <span className="pnk-home-glance__body">
        <span className="pnk-home-glance__title">ПНК</span>
        <span className="pnk-home-glance__meta">{meta}</span>
      </span>
      <ChevronRight size={22} className="pnk-home-glance__chevron" aria-hidden />
    </Link>
  )
}
