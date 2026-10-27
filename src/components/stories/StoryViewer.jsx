import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { storyMimeIsVideo } from '../../lib/stories/storyClubCore.js'
import { useStoryReel } from './useStoryReel.js'
import { StoryReactBar } from './StoryReactBar.jsx'
import { StoryViewHead } from './StoryViewHead.jsx'
import { StoryViewers } from './StoryViewers.jsx'

/**
 * Кадры одной или нескольких сторис клуба на весь экран.
 * Полоска сверху течёт и сама открывает следующий кадр (фото ~5 с, видео — по длине).
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
  const mediaRef = useRef(null)
  const {
    index,
    current,
    shown,
    leaving,
    motion,
    paused,
    error,
    fillSec,
    dragY,
    playing,
    bindZone,
    onFillEnd,
    onVideoMeta,
    onVideoEnded,
  } = useStoryReel({
    flat,
    loadFrame,
    onClose,
    onPeer,
    held: who || reactBusy,
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
    const el = mediaRef.current
    if (!el || el.tagName !== 'VIDEO') return
    if (paused) el.pause()
    else el.play().catch(() => {})
  }, [paused, shown?.frameId])

  if (!current) return null
  const cta = current.story.cta
  const leaveClass = motion === 'back' ? 'is-out-back' : 'is-out'
  const canReact = Boolean(onReact) && current.story.can_react !== false
  const mine = mineById[current.story.id] ?? null
  const videoShown = shown && storyMimeIsVideo(shown.mime)
  const videoLeaving = leaving && storyMimeIsVideo(leaving.mime)

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

  const frameClass = (extra) => `stories-view__frame${extra ? ` ${extra}` : ''}`

  return createPortal(
    <div
      className={`stories-view${paused ? ' is-paused' : ''}${dragY ? ' is-drag' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={current.story.author_name || current.story.label_ru}
      style={dragY ? { transform: `translate3d(0, ${dragY}px, 0)`, opacity: Math.max(0.45, 1 - dragY / 220) } : undefined}
    >
      <div className="stories-view__bars">
        {flat.map((item, i) => (
          <span key={`${item.story.id}-${item.frame.id}`} className={i < index ? 'is-done' : i === index && playing ? 'is-run' : ''}>
            <span
              className="stories-view__fill"
              style={i === index ? { animationDuration: `${fillSec}s` } : undefined}
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
              autoPlay
              playsInline
              muted={false}
              preload="auto"
              onLoadedMetadata={(e) => onVideoMeta(e.currentTarget.duration)}
              onEnded={onVideoEnded}
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
    </div>,
    document.body,
  )
}
