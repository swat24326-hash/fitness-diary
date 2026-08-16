import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react'
import { fetchClubCallTodayGlance } from '../../lib/admin/clubCallService.js'
import { callTodayGlanceEyebrow } from '../../lib/admin/salesCallTodayCore.js'
import {
  CALL_TODAY_HOME_GLANCE_CHANGED_EVENT,
  peekCallTodayHomeGlance,
  readCallTodayHomeGlanceSession,
  shouldNetworkRevalidateCallTodayHomeGlance,
  writeCallTodayHomeGlanceSession,
} from '../../lib/admin/callTodayHomeGlanceSession.js'
import '../../styles/club-call.css'

const SWIPE_THRESHOLD_PX = 42

/**
 * Glance «кому звонить сегодня» — третий слот ряда на главной менеджера.
 * Слот всегда занимает место (пустая очередь = подсказка), кроме suppressCard
 * (скрытый probe, чтобы знать hasCallQueue без показа карточки).
 * onQueueChange(true) — только когда есть кому звонить (для echo плитки / placement).
 *
 * @param {{
 *   clubId: string,
 *   hrefJournal?: string,
 *   compact?: boolean,
 *   expectVisible?: boolean,
 *   suppressCard?: boolean,
 *   onPresenceChange?: (visible: boolean) => void,
 *   onQueueChange?: (hasQueue: boolean) => void,
 * }} props
 */
export function SalesCallTodayGlance({
  clubId = '',
  hrefJournal = '/sales/call-log',
  compact = false,
  expectVisible = false,
  suppressCard = false,
  onPresenceChange,
  onQueueChange,
}) {
  const navigate = useNavigate()
  const cid = String(clubId || '').trim()
  const [items, setItems] = useState(() => peekCallTodayHomeGlance(cid)?.items ?? [])
  const [total, setTotal] = useState(() => peekCallTodayHomeGlance(cid)?.total ?? 0)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(() => !peekCallTodayHomeGlance(cid))
  const [loadError, setLoadError] = useState('')
  const touchRef = useRef({ startX: 0, moved: false })
  const presenceRef = useRef(null)
  const queueRef = useRef(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [cid])

  const reportPresence = useCallback(
    (visible) => {
      if (presenceRef.current === visible) return
      presenceRef.current = visible
      onPresenceChange?.(visible)
    },
    [onPresenceChange],
  )

  const reportQueue = useCallback(
    (hasQueue) => {
      const next = Boolean(hasQueue)
      if (queueRef.current === next) return
      queueRef.current = next
      onQueueChange?.(next)
    },
    [onQueueChange],
  )

  const applyGlance = useCallback(
    (glance) => {
      if (!aliveRef.current) return
      const nextItems = Array.isArray(glance?.items) ? glance.items : []
      const nextTotal = Math.max(0, Number(glance?.total) || nextItems.length)
      setItems(nextItems)
      setTotal(nextTotal)
      setIndex((prev) => (nextItems.length === 0 ? 0 : prev >= nextItems.length ? 0 : prev))
      setLoading(false)
      setLoadError('')
      reportPresence(true)
      reportQueue(nextTotal > 0)
    },
    [reportPresence, reportQueue],
  )

  useLayoutEffect(() => {
    if (!cid) {
      reportPresence(false)
      reportQueue(false)
      return
    }
    const cached = peekCallTodayHomeGlance(cid)
    if (cached) {
      setItems(cached.items)
      setTotal(cached.total)
      setLoading(false)
      reportPresence(true)
      reportQueue(cached.total > 0)
    } else {
      reportPresence(true)
      reportQueue(false)
      if (expectVisible) {
        /* слот уже зарезервирован session presence */
      }
    }
  }, [cid, expectVisible, reportPresence, reportQueue])

  const reload = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!cid) {
        if (!aliveRef.current) return
        setItems([])
        setTotal(0)
        setLoading(false)
        setLoadError('')
        reportPresence(false)
        reportQueue(false)
        return
      }
      const row = readCallTodayHomeGlanceSession(cid)
      const cached = row?.payload
      if (cached && Array.isArray(cached.items)) {
        applyGlance(cached)
      } else if (!silent && aliveRef.current) {
        setLoading(true)
      }

      const needNetwork = shouldNetworkRevalidateCallTodayHomeGlance({
        savedAt: row?.savedAt,
        hasCached: Boolean(cached && Array.isArray(cached.items)),
        force,
      })
      if (!needNetwork) return

      try {
        const next = await fetchClubCallTodayGlance(cid)
        if (!aliveRef.current) return
        writeCallTodayHomeGlanceSession(cid, next)
        applyGlance(next)
      } catch (e) {
        if (!aliveRef.current) return
        if (!cached?.items?.length && !silent) {
          setItems([])
          setTotal(0)
          setIndex(0)
          setLoadError(e?.message ? String(e.message).slice(0, 120) : 'Не удалось загрузить очередь')
        }
        reportPresence(true)
        reportQueue(Boolean(cached?.total > 0))
      } finally {
        if (aliveRef.current) setLoading(false)
      }
    },
    [cid, reportPresence, reportQueue, applyGlance],
  )

  useEffect(() => {
    void reload()
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    const onChanged = (ev) => {
      const id = String(ev?.detail?.clubId ?? '').trim()
      if (id && id !== cid) return
      void reload({ silent: true, force: true })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener(CALL_TODAY_HOME_GLANCE_CHANGED_EVENT, onChanged)
    const t = window.setInterval(() => void reload({ silent: true }), 120_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(CALL_TODAY_HOME_GLANCE_CHANGED_EVENT, onChanged)
      window.clearInterval(t)
    }
  }, [cid, reload])

  const card = items[index] || null
  const eyebrow = callTodayGlanceEyebrow({ total })
  const multi = items.length > 1

  const go = (delta) => {
    if (!items.length) return
    setIndex((i) => (i + delta + items.length) % items.length)
  }

  const onOpen = () => {
    if (card?.href) navigate(card.href)
    else navigate(hrefJournal)
  }

  if (suppressCard) return null

  return (
    <div
      className={`sales-call-today-glance${compact ? ' sales-call-today-glance--compact' : ''}${card?.tone === 'hot' ? ' sales-call-today-glance--hot' : ''}`}
    >
      <div
        className="sales-call-today-glance__card"
        onTouchStart={(e) => {
          touchRef.current = { startX: e.touches[0]?.clientX ?? 0, moved: false }
        }}
        onTouchMove={(e) => {
          const x = e.touches[0]?.clientX ?? 0
          if (Math.abs(x - touchRef.current.startX) > 8) touchRef.current.moved = true
        }}
        onTouchEnd={(e) => {
          if (!multi || !touchRef.current.moved) return
          const x = e.changedTouches[0]?.clientX ?? 0
          const dx = x - touchRef.current.startX
          if (dx <= -SWIPE_THRESHOLD_PX) go(1)
          else if (dx >= SWIPE_THRESHOLD_PX) go(-1)
        }}
      >
        <div className="sales-call-today-glance__top">
          <span className="sales-call-today-glance__icon" aria-hidden>
            <Phone size={18} />
          </span>
          <div className="sales-call-today-glance__head-text">
            <h2 className="sales-call-today-glance__eyebrow">{eyebrow}</h2>
            <p className="sales-call-today-glance__meta muted">из журнала и пометок</p>
          </div>
          {total > 0 ? (
            <span className="sales-call-today-glance__badge" aria-label={`В очереди ${total}`}>
              {Math.min(index + 1, items.length) || 0}/{total}
            </span>
          ) : null}
        </div>

        {loading && !card ? (
          <p className="muted sales-call-today-glance__empty">Загрузка очереди…</p>
        ) : card ? (
          <>
            <button
              type="button"
              className="sales-call-today-glance__main"
              onClick={onOpen}
              aria-label={`Открыть карточку: ${card.client_name}`}
            >
              <strong className="sales-call-today-glance__name">{card.client_name}</strong>
              <span
                className={`sales-call-today-glance__reason${card.tone === 'hot' ? ' sales-call-today-glance__reason--hot' : ''}`}
              >
                {card.reason}
              </span>
            </button>
            {multi ? (
              <div className="sales-call-today-glance__nav">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch"
                  onClick={() => go(-1)}
                  aria-label="Предыдущий"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch"
                  onClick={() => go(1)}
                  aria-label="Следующий"
                >
                  <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            ) : null}
            <button type="button" className="sales-call-today-glance__cta muted" onClick={onOpen}>
              Открыть карточку
            </button>
          </>
        ) : (
          <>
            <p className="sales-call-today-glance__empty">
              {loadError
                ? loadError
                : 'Пока нет кого звонить по пометкам и пропущенным. После звонка оставьте пометку — человек появится здесь.'}
            </p>
            <button
              type="button"
              className="sales-call-today-glance__cta muted"
              onClick={() => (loadError ? void reload({ force: true }) : navigate(hrefJournal))}
            >
              {loadError ? 'Повторить' : 'Журнал звонков'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
