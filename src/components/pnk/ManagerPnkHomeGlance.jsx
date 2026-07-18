import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPnkBundle } from '../../lib/pnk/pnkApiService.js'
import { buildPnkManagerHomeGlanceCards } from '../../lib/pnk/pnkManagerHomeGlanceCore.js'
import { PnkGlanceCardFace } from './PnkGlanceCardFace.jsx'
import '../../styles/pnk-funnel.css'

const SWIPE_THRESHOLD_PX = 42

/**
 * ПНК на главной менеджера / админа — те же принципы, что доска контроля.
 * @param {{ clubId: string, href?: string }} props
 */
export function ManagerPnkHomeGlance({ clubId = '', href = '/sales/pnk' }) {
  const navigate = useNavigate()
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const touchRef = useRef({ startX: 0, moved: false })

  const reload = useCallback(async (opts = {}) => {
    const silent = opts.silent === true
    const cid = String(clubId || '').trim()
    if (!cid) {
      setCards([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const data = await fetchPnkBundle({ clubId: cid })
      const next = buildPnkManagerHomeGlanceCards(data?.clients ?? [], { boardHref: href })
      setCards(next)
      setIndex((prev) => (prev >= next.length ? 0 : prev))
    } catch {
      if (!silent) {
        setCards([])
        setIndex(0)
      }
    } finally {
      setLoading(false)
    }
  }, [clubId, href])

  useEffect(() => {
    void reload()
  }, [reload])

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

  if (!String(clubId || '').trim()) return null
  if (loading || !cards.length) return null

  const card = cards[index] ?? cards[0]
  const hasMany = cards.length > 1
  const trainerLine =
    card.trainerName && card.trainerName !== '—' ? `Тренер: ${card.trainerName}` : ''

  return (
    <section className="trainer-task-glance manager-pnk-glance" aria-labelledby="manager-pnk-glance-title">
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
