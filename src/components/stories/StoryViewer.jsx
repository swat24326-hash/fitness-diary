import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { storyMimeIsVideo } from '../../lib/stories/storyClubCore.js'
import { useStoryReel } from './useStoryReel.js'
import { StoryReactBar } from './StoryReactBar.jsx'
import { StoryViewHead } from './StoryViewHead.jsx'
import { StoryViewers } from './StoryViewers.jsx'

/**
 * Просмотр сторис как в Instagram / ВК / Telegram:
 * кадр в «телефоне» 9:16; на телефоне — на весь экран, на планшете и мониторе — по центру.
 */
export function StoryViewer({
  stories,
  loadFrame,
  onSeen,
  onClose,
  onPeer,
  onCta,
  onRemove,
  onBanPublish,
  onUnbanPublish,
  onReact,
}) {
  const flat = useMemo(
    () => stories.flatMap((story) => story.frames.map((frame) => ({ story, frame }))),
    [stories],
  )
  const [who, setWho] = useState(false)
  const [reactBusy, setReactBusy] = useState(false)
  const [mineById, setMineById] = useState(() => Object.fromEntries(stories.map((s) => [s.id, s.my_reaction ?? null])))
  const [needsTap, setNeedsTap] = useState(false)
  const mediaRef = useRef(null)
  const unmutedRef = useRef(false)
  const {
    index,
    current,
    shown,
    leaving,
    motion,
    paused,
    error,
    fillSec,
    fillReady,
    openGuard,
    dragY,
    playing,
    bindZone,
    onFillEnd,
    onVideoMeta,
    onVideoPlaying,
    onVideoEnded,
  } = useStoryReel({
    flat,
    loadFrame,
    onClose,
    onPeer,
    held: who || reactBusy || needsTap,
  })
  const storyId = current?.story.id
  const seenRef = useRef(onSeen)
  seenRef.current = onSeen

  useEffect(() => {
    if (storyId) seenRef.current(storyId)
  }, [storyId])

  useEffect(() => {
    setMineById(Object.fromEntries(stories.map((s) => [s.id, s.my_reaction ?? null])))
  }, [stories])

  useEffect(() => {
    setNeedsTap(false)
    unmutedRef.current = false
  }, [shown?.frameId])

  useEffect(() => {
    const el = mediaRef.current
    if (!el || el.tagName !== 'VIDEO') return undefined
    if (paused) {
      el.pause()
      return undefined
    }
    // Как в Telegram / Safari: стартуем muted, звук только через DOM — без смены React-prop muted
    // (иначе iPhone играет ~1 с и зависает).
    if (!unmutedRef.current) el.muted = true
    let cancelled = false
    const run = el.play()
    if (run && typeof run.then === 'function') {
      run
        .then(() => {
          if (cancelled) return
          setNeedsTap(false)
          try {
            el.muted = false
            unmutedRef.current = true
          } catch {
            /* Safari может оставить muted */
          }
          onVideoPlaying()
        })
        .catch(() => {
          if (!cancelled) setNeedsTap(true)
        })
    }
    return () => {
      cancelled = true
    }
  }, [paused, shown?.frameId, onVideoPlaying])

  if (!current) return null
  const cta = current.story.cta
  const leaveClass = motion === 'back' ? 'is-out-back' : 'is-out'
  const canReact = Boolean(onReact) && current.story.can_react !== false
  const mine = mineById[current.story.id] ?? null
  const videoShown = shown && storyMimeIsVideo(shown.mime)
  const videoLeaving = leaving && storyMimeIsVideo(leaving.mime)
  const barRunning = playing && fillReady && !needsTap && !paused

  const pickReact = (emoji) => {
    if (!onReact || reactBusy) return
    setReactBusy(true)
    onReact(current.story.id, emoji)
      .then((res) => {
        setMineById((prev) => ({ ...prev, [current.story.id]: res?.reaction ?? null }))
      })
      .catch(() => {})
      .finally(() => setReactBusy(false))
  }

  const tapToPlay = () => {
    const el = mediaRef.current
    if (!el || el.tagName !== 'VIDEO') return
    el.muted = true
    el.play()
      .then(() => {
        setNeedsTap(false)
        try {
          el.muted = false
          unmutedRef.current = true
        } catch {
          /* ignore */
        }
        onVideoPlaying()
      })
      .catch(() => setNeedsTap(true))
  }

  const frameClass = (extra) => `stories-view__frame${extra ? ` ${extra}` : ''}`

  return createPortal(
    <div
      className={`stories-view${paused || needsTap ? ' is-paused' : ''}${dragY ? ' is-drag' : ''}${openGuard ? ' is-open-guard' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={current.story.author_name || current.story.label_ru}
      style={dragY ? { transform: `translate3d(0, ${dragY}px, 0)`, opacity: Math.max(0.45, 1 - dragY / 220) } : undefined}
      onClick={(e) => {
        if (openGuard) return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="stories-view__phone">
        <div className="stories-view__bars">
          {flat.map((item, i) => (
            <span
              key={`${item.story.id}-${item.frame.id}`}
              className={i < index ? 'is-done' : i === index && barRunning ? 'is-run' : ''}
            >
              <span
                key={i === index ? `fill-${item.frame.id}-${fillSec ?? 0}` : 'fill'}
                className="stories-view__fill"
                style={i === index && fillReady ? { animationDuration: `${fillSec}s` } : undefined}
                onAnimationEnd={i === index ? onFillEnd : undefined}
              />
            </span>
          ))}
        </div>
        <StoryViewHead
          name={current.story.author_name || current.story.label_ru}
          photo={current.story.author_photo}
          createdAt={current.story.created_at}
        />
        <button type="button" className="stories-view__close btn-touch" onClick={onClose} aria-label="Закрыть">
          <X size={22} aria-hidden />
        </button>
        <div className="stories-view__stage">
          {leaving ? (
            videoLeaving ? (
              <video className={frameClass(leaveClass)} src={leaving.src} muted playsInline preload="auto" />
            ) : (
              <img className={frameClass(leaveClass)} src={leaving.src} alt="" />
            )
          ) : null}
          {shown ? (
            videoShown ? (
              <video
                key={shown.frameId}
                ref={mediaRef}
                className={frameClass(motion ? `is-${motion}` : '')}
                src={shown.src}
                playsInline
                muted
                preload="auto"
                onLoadedMetadata={(e) => onVideoMeta(e.currentTarget.duration)}
                onPlaying={onVideoPlaying}
                onEnded={(e) => onVideoEnded(e.currentTarget)}
                onError={() => setNeedsTap(true)}
              />
            ) : (
              <img
                key={shown.frameId}
                className={frameClass(motion ? `is-${motion}` : '')}
                src={shown.src}
                alt={current.frame.caption || current.story.author_name || current.story.label_ru}
              />
            )
          ) : null}
          {needsTap && videoShown ? (
            <button type="button" className="stories-view__tap-play btn-touch" onClick={tapToPlay}>
              Коснитесь, чтобы смотреть
            </button>
          ) : null}
        </div>
        {!shown && !error ? <p className="stories-view__status">Загружаем…</p> : null}
        {error ? <p className="stories-view__status stories-view__status--error">{error}</p> : null}
        <button type="button" className="stories-view__prev" aria-label="Предыдущий кадр" {...bindZone(-1)} />
        <button type="button" className="stories-view__next" aria-label="Следующий кадр" {...bindZone(1)} />
        <div className="stories-view__foot">
          {current.frame.caption ? <p>{current.frame.caption}</p> : null}
          {canReact ? <StoryReactBar mine={mine} onPick={pickReact} busy={reactBusy} /> : null}
          <span className="stories-view__actions">
            {cta === 'chat' && onCta ? (
              <button type="button" className="btn btn-touch" onClick={() => onCta('chat')}>
                Написать менеджеру
              </button>
            ) : null}
            {cta === 'membership' && onCta ? (
              <button type="button" className="btn btn-touch" onClick={() => onCta('membership')}>
                Мой абонемент
              </button>
            ) : null}
            {onBanPublish && current.story.can_ban ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => onBanPublish(current.story.author_id)}
              >
                Запретить выкладывать
              </button>
            ) : null}
            {onUnbanPublish && current.story.can_unban ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => onUnbanPublish(current.story.author_id)}
              >
                Разрешить снова
              </button>
            ) : null}
          </span>
          <div className="stories-view__bottom">
            <StoryViewers viewers={current.story.viewers} open={who} onToggle={() => setWho((v) => !v)} />
            {onRemove && current.story.can_remove ? (
              <button
                type="button"
                className="stories-view__remove btn-touch"
                onClick={() => onRemove(current.story.id)}
                aria-label="Снять сторис"
                title="Снять сторис"
              >
                <Trash2 size={22} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
