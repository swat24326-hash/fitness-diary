import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { fetchIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import {
  buildDispatchGlanceCaption,
  sortActiveDispatchTasks,
} from '../../lib/admin/iskraDispatchInboxActionsCore.js'
import {
  requestOpenTrainerInbox,
  TRAINER_INBOX_UPDATED_EVENT,
} from '../../lib/admin/trainerInboxEvents.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import { DispatchTaskProgressMini } from './DispatchTaskProgressMini.jsx'

const SWIPE_THRESHOLD_PX = 42

/**
 * @param {{ clubId?: string }} props
 */
export function TrainerTaskGlanceWidget({ clubId = '' }) {
  const [tasks, setTasks] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const touchRef = useRef({ startX: 0, moved: false })

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchIskraDispatch({ clubId: clubId || undefined, view: 'inbox', limit: 20 })
      const list = Array.isArray(data?.items) ? data.items : []
      const active = sortActiveDispatchTasks(list)
      setTasks(active)
      setIndex((prev) => (prev >= active.length ? 0 : prev))
    } catch {
      setTasks([])
      setIndex(0)
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 120_000)
    const onUpdate = () => void reload()
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener(TRAINER_INBOX_UPDATED_EVENT, onUpdate)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      window.removeEventListener(TRAINER_INBOX_UPDATED_EVENT, onUpdate)
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
    requestOpenTrainerInbox()
  }

  if (loading || !tasks.length) return null

  const task = tasks[index] ?? tasks[0]
  const caption = buildDispatchGlanceCaption(task)
  const isNew = task.status === 'pending'
  const isHot = task.is_overdue || task.priority === 'high'
  const hasMany = tasks.length > 1

  return (
    <section className="trainer-task-glance" aria-labelledby="trainer-task-glance-title">
      <div
        className={`trainer-task-glance__card${isHot ? ' trainer-task-glance__card--hot' : ''}`}
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
            <span className="trainer-task-glance__icon" aria-hidden>
              <ClipboardList size={18} />
            </span>
            <div className="trainer-task-glance__head-text">
              <h2 id="trainer-task-glance-title" className="trainer-task-glance__title">
                {isNew ? 'Новое задание' : 'Задание от руководства'}
              </h2>
              <p className="trainer-task-glance__from muted">{task.sender_name || 'Руководство'}</p>
            </div>
            <ChevronRight size={18} className="trainer-task-glance__chevron" aria-hidden />
          </div>

          <p className="trainer-task-glance__task-title">{task.title}</p>
          <DispatchTaskProgressMini progress={task.progress} />
          {caption ? <p className="trainer-task-glance__caption muted">{caption}</p> : null}
        </button>

        {hasMany ? (
          <div className="trainer-task-glance__dots" role="tablist" aria-label="Задания">
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
