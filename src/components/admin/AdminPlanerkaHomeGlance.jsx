import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { fetchIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import {
  buildDispatchGlanceCaption,
  sortActiveDispatchTasks,
} from '../../lib/admin/iskraDispatchInboxActionsCore.js'
import { dispatchStatusLabelRu } from '../../lib/admin/iskraDispatchCore.js'
import {
  isPlanerkaHomeGlanceFresh,
  peekPlanerkaHomeGlanceTasks,
  readPlanerkaHomeGlanceSession,
  writePlanerkaHomeGlanceSession,
} from '../../lib/admin/planerkaHomeGlanceSession.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import { DispatchTaskProgressMini } from '../iskra/DispatchTaskProgressMini.jsx'

const SWIPE_THRESHOLD_PX = 42

/**
 * Активные задания клуба на главной админа (view=sent) — last-good сразу.
 *
 * @param {{
 *   clubId?: string,
 *   href?: string,
 *   compact?: boolean,
 *   expectVisible?: boolean,
 *   suppressCard?: boolean,
 *   onPresenceChange?: (visible: boolean) => void,
 * }} props
 */
export function AdminPlanerkaHomeGlance({
  clubId = '',
  href = '/admin/club-tasks',
  compact = false,
  expectVisible = false,
  suppressCard = false,
  onPresenceChange,
}) {
  const navigate = useNavigate()
  const cid = String(clubId || '').trim()
  const [tasks, setTasks] = useState(() => (cid ? peekPlanerkaHomeGlanceTasks(cid) ?? [] : []))
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(() => (cid ? !(peekPlanerkaHomeGlanceTasks(cid)?.length) : false))
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

  useLayoutEffect(() => {
    if (!cid) {
      reportPresence(false)
      return
    }
    const cached = peekPlanerkaHomeGlanceTasks(cid)
    if (cached?.length) {
      setTasks(cached)
      setLoading(false)
      reportPresence(true)
    } else if (expectVisible) {
      reportPresence(true)
    }
  }, [cid, expectVisible, reportPresence])

  const reload = useCallback(
    async ({ force = false, silent = false } = {}) => {
      if (!cid || !isSupabaseConfigured()) {
        setTasks([])
        setLoading(false)
        reportPresence(false)
        return
      }
      const row = readPlanerkaHomeGlanceSession(cid)
      const cached = Array.isArray(row?.payload?.tasks) ? row.payload.tasks : []
      if (cached.length) {
        setTasks(cached)
        setLoading(false)
        reportPresence(true)
        if (!force && !silent && isPlanerkaHomeGlanceFresh(row.savedAt)) return
        if (!force && silent && isPlanerkaHomeGlanceFresh(row.savedAt)) return
      } else if (!silent) {
        setLoading(true)
      }

      try {
        const data = await fetchIskraDispatch({ clubId: cid, view: 'sent', limit: 20 })
        const list = Array.isArray(data?.items) ? data.items : []
        const active = sortActiveDispatchTasks(list)
        setTasks(active)
        setIndex((prev) => (prev >= active.length ? 0 : prev))
        writePlanerkaHomeGlanceSession(cid, active)
        reportPresence(active.length > 0)
      } catch {
        if (!cached.length && !silent) {
          setTasks([])
          setIndex(0)
          reportPresence(false)
        }
      } finally {
        setLoading(false)
      }
    },
    [cid, reportPresence],
  )

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload({ silent: true }), 120_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload])

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(tasks.length - 1, i + 1))
  }, [tasks.length])

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
    navigate(href)
  }

  if (!cid) return null

  if (suppressCard) return null

  if (loading && !tasks.length) {
    if (compact && !expectVisible) return null
    return (
      <section
        className="trainer-task-glance admin-planerka-glance admin-planerka-glance--skel"
        aria-busy="true"
        aria-label="Загрузка планёрки"
      >
        <div className="admin-home-skel manager-pnk-glance__skel-card" />
      </section>
    )
  }
  if (!tasks.length) return null

  const task = tasks[index] ?? tasks[0]
  const caption = buildDispatchGlanceCaption(task)
  const isHot = task.is_overdue || task.priority === 'high'
  const hasMany = tasks.length > 1
  const statusLabel = dispatchStatusLabelRu(task.status)
  const recipient = String(task.recipient_name ?? '').trim()

  return (
    <section
      className={`trainer-task-glance admin-planerka-glance${compact ? ' admin-planerka-glance--compact' : ''}`}
      aria-labelledby="admin-planerka-glance-title"
    >
      <div
        className={`trainer-task-glance__card admin-planerka-glance__card${isHot ? ' trainer-task-glance__card--hot' : ''}`}
        onTouchStart={hasMany ? onTouchStart : undefined}
        onTouchMove={hasMany ? onTouchMove : undefined}
        onTouchEnd={hasMany ? onTouchEnd : undefined}
      >
        {hasMany ? (
          <div className="trainer-task-glance__nav" aria-hidden={tasks.length <= 1}>
            <button
              type="button"
              className="trainer-task-glance__nav-btn"
              disabled={index <= 0}
              aria-label="Предыдущее задание"
              onClick={(e) => {
                e.stopPropagation()
                goPrev()
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="trainer-task-glance__pager muted">
              {index + 1} / {tasks.length}
            </span>
            <button
              type="button"
              className="trainer-task-glance__nav-btn"
              disabled={index >= tasks.length - 1}
              aria-label="Следующее задание"
              onClick={(e) => {
                e.stopPropagation()
                goNext()
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="trainer-task-glance__body"
          onClick={onCardClick}
          aria-label={`Открыть планёрку: ${task.title}`}
        >
          <div className="trainer-task-glance__head">
            <span className="trainer-task-glance__icon admin-planerka-glance__icon" aria-hidden>
              <ClipboardList size={18} />
            </span>
            <div className="trainer-task-glance__head-text">
              <h2 id="admin-planerka-glance-title" className="trainer-task-glance__title">
                {isHot ? 'Планёрка · срочно' : 'Планёрка'}
              </h2>
              <p className="trainer-task-glance__from muted">
                {recipient ? `Кому: ${recipient}` : statusLabel || 'Активное задание'}
              </p>
            </div>
            <ChevronRight size={18} className="trainer-task-glance__chevron" aria-hidden />
          </div>

          <p className="trainer-task-glance__task-title">{task.title}</p>
          <DispatchTaskProgressMini progress={task.progress} />
          {caption ? <p className="trainer-task-glance__caption muted">{caption}</p> : null}
        </button>

        {hasMany ? (
          <div className="trainer-task-glance__dots" role="tablist" aria-label="Задания планёрки">
            {tasks.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Задание ${i + 1}: ${t.title}`}
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
