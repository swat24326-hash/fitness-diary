import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStoryReel } from './useStoryReel.js'
import { StoryViewers } from './StoryViewers.jsx'

/**
 * Кадры одной или нескольких сторис клуба на весь экран.
 * Полоска сверху течёт около 5 секунд и сама открывает следующий кадр.
 * @param {{ stories: object[], loadFrame: (storyId: string, frameId: string) => Promise<{ data: string, mime: string }>, onSeen: (storyId: string) => void, onClose: () => void, onCta?: (cta: string) => void, onRemove?: (storyId: string) => void }} props
 */
export function StoryViewer({ stories, loadFrame, onSeen, onClose, onCta, onRemove }) {
  const flat = useMemo(
    () => stories.flatMap((story) => story.frames.map((frame) => ({ story, frame }))),
    [stories],
  )
  const [who, setWho] = useState(false)
  const { index, current, shown, leaving, motion, paused, error, playing, bindZone, onFillEnd } = useStoryReel({
    flat,
    loadFrame,
    onClose,
    held: who,
  })
  const storyId = current?.story.id
  const seenRef = useRef(onSeen)
  seenRef.current = onSeen

  useEffect(() => {
    if (storyId) seenRef.current(storyId)
  }, [storyId])

  if (!current) return null
  const cta = current.story.cta
  const leaveClass = motion === 'back' ? 'is-out-back' : 'is-out'
  return (
    <div className={`stories-view${paused ? ' is-paused' : ''}`} role="dialog" aria-label={current.story.label_ru}>
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
            alt={current.frame.caption || current.story.label_ru}
          />
        ) : null}
      </div>
      {!shown && !error ? <p className="stories-view__status">Загружаем…</p> : null}
      {error ? <p className="stories-view__status stories-view__status--error">{error}</p> : null}
      <button type="button" className="stories-view__prev" aria-label="Предыдущий кадр" {...bindZone(-1)} />
      <button type="button" className="stories-view__next" aria-label="Следующий кадр" {...bindZone(1)} />
      <div className="stories-view__foot">
        <strong>{current.story.label_ru}</strong>
        {current.frame.caption ? <p>{current.frame.caption}</p> : null}
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
          {onRemove ? (
            <button type="button" className="btn btn-ghost btn-touch" onClick={() => onRemove(current.story.id)}>
              Снять
            </button>
          ) : null}
        </span>
        <StoryViewers viewers={current.story.viewers} open={who} onToggle={() => setWho((v) => !v)} />
      </div>
    </div>
  )
}
