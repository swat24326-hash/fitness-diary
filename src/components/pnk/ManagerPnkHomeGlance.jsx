import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPnkBundle } from '../../lib/pnk/pnkApiService.js'
import { buildPnkManagerHomeGlanceCards } from '../../lib/pnk/pnkManagerHomeGlanceCore.js'
import {
  PNK_HOME_GLANCE_CHANGED_EVENT,
  peekPnkHomeGlanceCards,
  readPnkHomeGlanceSession,
  shouldNetworkRevalidatePnkHomeGlance,
  writePnkHomeGlanceSession,
} from '../../lib/pnk/pnkHomeGlanceSession.js'
import { PnkGlanceCardFace } from './PnkGlanceCardFace.jsx'
import '../../styles/pnk-funnel.css'

const SWIPE_THRESHOLD_PX = 42

/**
 * ПНК на главной менеджера / админа — last-good сразу, сеть с debounce под ×10 клубов.
 * @param {{
 *   clubId: string,
 *   href?: string,
 *   compact?: boolean,
 *   expectVisible?: boolean,
 *   onPresenceChange?: (visible: boolean) => void,
 * }} props
 */
export function ManagerPnkHomeGlance({
  clubId = '',
  href = '/sales/pnk',
  compact = false,
  expectVisible = false,
  onPresenceChange,
}) {
  const navigate = useNavigate()
  const cid = String(clubId || '').trim()
  const [cards, setCards] = useState(() => (cid ? peekPnkHomeGlanceCards(cid) ?? [] : []))
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(() => (cid ? !(peekPnkHomeGlanceCards(cid)?.length) : false))
  const touchRef = useRef({ startX: 0, moved: false })
  const presenceRef = useRef(null)

  const reportPresence = useCallback(
    (visible) => {
      if (presenceRef.current === visible) return
      presenceRef.current = visible
      onPresenceChange?.(visible)
    },
    [onPresenceChange],
  )

  const applySessionCards = useCallback(
    (list) => {
      const next = Array.isArray(list) ? list : []
      setCards(next)
      setIndex((prev) => (prev >= next.length ? 0 : prev))
      setLoading(false)
      reportPresence(next.length > 0)
    },
    [reportPresence],
  )

  useLayoutEffect(() => {
    if (!cid) {
      reportPresence(false)
      return
    }
    const cached = peekPnkHomeGlanceCards(cid)
    if (cached?.length) {
      setCards(cached)
      setLoading(false)
      reportPresence(true)
    } else if (expectVisible) {
      reportPresence(true)
    }
  }, [cid, expectVisible, reportPresence])

  const reload = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!cid) {
        setCards([])
        setLoading(false)
        reportPresence(false)
        return
      }
      const row = readPnkHomeGlanceSession(cid)
      const cached = Array.isArray(row?.payload?.cards) ? row.payload.cards : []
      if (cached.length) {
        applySessionCards(cached)
      } else if (!silent) {
        setLoading(true)
      }

      const needNetwork = shouldNetworkRevalidatePnkHomeGlance({
        savedAt: row?.savedAt,
        hasCachedCards: cached.length > 0,
        force,
      })
      if (!needNetwork) return

      try {
        const data = await fetchPnkBundle({ clubId: cid })
        const next = buildPnkManagerHomeGlanceCards(data?.clients ?? [], { boardHref: href })
        writePnkHomeGlanceSession(cid, next)
        applySessionCards(next)
      } catch {
        if (!cached.length && !silent) {
          setCards([])
          setIndex(0)
          reportPresence(false)
        }
      } finally {
        setLoading(false)
      }
    },
    [cid, href, reportPresence, applySessionCards],
  )

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload({ silent: true }), 120_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    const onChanged = (ev) => {
      const eventClub = String(ev?.detail?.clubId ?? '').trim()
      if (!eventClub || eventClub !== cid) return
      const next = peekPnkHomeGlanceCards(cid) ?? []
      applySessionCards(next)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener(PNK_HOME_GLANCE_CHANGED_EVENT, onChanged)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(PNK_HOME_GLANCE_CHANGED_EVENT, onChanged)
    }
  }, [reload, cid, applySessionCards])

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(cards.length - 1, i + 1))
  }, [cards.length])

  const onTouchStart = (e) => {
    touchRef.current = { startX: e.touches[0]?.clientX ?? 0, moved: false }
  }

  const onTouchMove = (e) => {
    const dx = (e.touches[0]?.clientX ?? 0) - touchRef.current.startX
    if (Math.abs(dx) > 10) touchRef.current.moved = true
  }

  const onTouchEnd = (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchRef.current.startX
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  const onCardClick = () => {
    if (touchRef.current.moved) {
      touchRef.current.moved = false
      return
    }
    const card = cards[index] ?? cards[0]
    if (card?.href) navigate(card.href)
  }

  if (!cid) return null

  if (loading && !cards.length) {
    if (compact && !expectVisible) return null
    return (
      <section
        className="trainer-task-glance manager-pnk-glance manager-pnk-glance--skel"
        aria-busy="true"
        aria-label="Загрузка ПНК"
      >
        <div className="admin-home-skel manager-pnk-glance__skel-card" />
      </section>
    )
  }
  if (!cards.length) return null

  const card = cards[index] ?? cards[0]
  const hasMany = cards.length > 1
  const trainerLine =
    card.trainerName && card.trainerName !== '—' ? `Тренер: ${card.trainerName}` : ''

  return (
    <section
      className={`trainer-task-glance manager-pnk-glance${compact ? ' manager-pnk-glance--compact' : ''}`}
      aria-labelledby="manager-pnk-glance-title"
    >
      <div
        className={`trainer-task-glance__card manager-pnk-glance__card pnk-glance-shell${card.isHot ? ' trainer-task-glance__card--hot manager-pnk-glance__card--hot' : ''}`}
        onTouchStart={hasMany ? onTouchStart : undefined}
        onTouchMove={hasMany ? onTouchMove : undefined}
        onTouchEnd={hasMany ? onTouchEnd : undefined}
      >
        {hasMany ? (
          <div className="trainer-task-glance__nav" aria-hidden={cards.length <= 1}>
            <button
              type="button"
              className="trainer-task-glance__nav-btn"
              disabled={index <= 0}
              aria-label="Предыдущий ПНК"
              onClick={(e) => {
                e.stopPropagation()
                goPrev()
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="trainer-task-glance__pager muted">
              {index + 1} / {cards.length}
            </span>
            <button
              type="button"
              className="trainer-task-glance__nav-btn"
              disabled={index >= cards.length - 1}
              aria-label="Следующий ПНК"
              onClick={(e) => {
                e.stopPropagation()
                goNext()
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}

        <PnkGlanceCardFace
          name={card.name}
          stepN={card.stepN}
          stepTotal={card.stepTotal}
          stepTitle={card.stepTitle}
          caption={card.caption}
          isHot={card.isHot}
          hotLabel={card.hotLabel}
          metaLine={trainerLine}
          eyebrow={card.isHot ? 'ПНК требует внимания' : 'ПНК в работе'}
          titleId="manager-pnk-glance-title"
          onClick={onCardClick}
          ariaLabel={`Открыть доску ПНК: ${card.name}`}
        />

        {hasMany ? (
          <div className="trainer-task-glance__dots" role="tablist" aria-label="ПНК">
            {cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`ПНК ${i + 1}: ${c.name}`}
                className={`trainer-task-glance__dot${i === index ? ' trainer-task-glance__dot--on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex(i)
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
