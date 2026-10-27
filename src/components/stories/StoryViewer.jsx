import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { useStoryReel } from './useStoryReel.js'
import { StoryReactBar } from './StoryReactBar.jsx'
import { StoryViewers } from './StoryViewers.jsx'

/**
 * Кадры одной или нескольких сторис клуба на весь экран.
 * Полоска сверху течёт около 5 секунд и сама открывает следующий кадр.
 */
export function StoryViewer({
  stories,
  loadFrame,
  onSeen,
  onClose,
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
  const { index, current, shown, leaving, motion, paused, error, playing, bindZone, onFillEnd } = useStoryReel({
    flat,
    loadFrame,
    onClose,
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

  if (!current) return null
  const cta = current.story.cta
  const leaveClass = motion === 'back' ? 'is-out-back' : 'is-out'
  const canReact = Boolean(onReact) && current.story.can_react !== false
  const mine = mineById[current.story.id] ?? null

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

  return createPortal(
    <div
      className={`stories-view${paused ? ' is-paused' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={current.story.author_name || current.story.label_ru}
    >
      <div className="stories-view__bars">
        {flat.map((item, i) => (
          <span key={`${item.story.id}-${item.frame.id}`} className={i < index ? 'is-done' : i === index && playing ? 'is-run' : ''}>
            <span className="stories-view__fill" onAnimationEnd={i === index ? onFillEnd : undefined} />
          </span>
        ))}
      </div>
      <button type="button" className="stories-view__close btn-touch" onClick={onClose} aria-label="Закрыть">
        <X size={22} aria-hidden />
      </button>
      <div className="stories-view__stage">
        {leaving ? <img className={`stories-view__frame ${leaveClass}`} src={leaving.src} alt="" /> : null}
        {shown ? (
          <img
            key={shown.frameId}
            className={`stories-view__frame${motion ? ` is-${motion}` : ''}`}
            src={shown.src}
            alt={current.frame.caption || current.story.author_name || current.story.label_ru}
          />
        ) : null}
      </div>
      {!shown && !error ? <p className="stories-view__status">Загружаем…</p> : null}
      {error ? <p className="stories-view__status stories-view__status--error">{error}</p> : null}
      <button type="button" className="stories-view__prev" aria-label="Предыдущий кадр" {...bindZone(-1)} />
      <button type="button" className="stories-view__next" aria-label="Следующий кадр" {...bindZone(1)} />
      <div className="stories-view__foot">
        <strong>{current.story.author_name || current.story.label_ru}</strong>
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
