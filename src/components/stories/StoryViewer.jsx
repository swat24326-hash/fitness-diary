import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Кадры одной или нескольких сторис клуба на весь экран.
 * @param {{ stories: object[], loadFrame: (storyId: string, frameId: string) => Promise<{ data: string, mime: string }>, onSeen: (storyId: string) => void, onClose: () => void, onCta?: (cta: string) => void, onRemove?: (storyId: string) => void }} props
 */
export function StoryViewer({ stories, loadFrame, onSeen, onClose, onCta, onRemove }) {
  const flat = stories.flatMap((story) => story.frames.map((frame) => ({ story, frame })))
  const [index, setIndex] = useState(0)
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  const current = flat[index]
  const storyId = current?.story.id
  const seenRef = useRef(onSeen)
  seenRef.current = onSeen

  useEffect(() => {
    if (storyId) seenRef.current(storyId)
  }, [storyId])

  const frameId = current?.frame.id
  const frameStoryId = current?.story.id
  useEffect(() => {
    if (!frameId || !frameStoryId) return undefined
    let alive = true
    setSrc('')
    setError('')
    loadFrame(frameStoryId, frameId)
      .then((file) => {
        if (alive) setSrc(`data:${file.mime};base64,${file.data}`)
      })
      .catch((e) => {
        if (alive) setError(e?.message || 'Не получилось загрузить')
      })
    return () => {
      alive = false
    }
  }, [frameId, frameStoryId, loadFrame])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((n) => Math.min(flat.length - 1, n + 1))
      if (e.key === 'ArrowLeft') setIndex((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flat.length, onClose])

  if (!current) return null
  const cta = current.story.cta
  return (
    <div className="stories-view" role="dialog" aria-label={current.story.label_ru}>
      <div className="stories-view__bars">
        {flat.map((item, i) => (
          <span key={`${item.story.id}-${item.frame.id}`} className={i <= index ? 'is-on' : ''} />
        ))}
      </div>
      <button type="button" className="stories-view__close btn-touch" onClick={onClose} aria-label="Закрыть">
        <X size={22} aria-hidden />
      </button>
      {src ? <img src={src} alt={current.frame.caption || current.story.label_ru} /> : null}
      {!src && !error ? <p className="stories-view__status">Загружаем…</p> : null}
      {error ? <p className="stories-view__status stories-view__status--error">{error}</p> : null}
      <button type="button" className="stories-view__prev" aria-label="Предыдущий кадр" onClick={() => setIndex((n) => Math.max(0, n - 1))} />
      <button type="button" className="stories-view__next" aria-label="Следующий кадр" onClick={() => (index + 1 < flat.length ? setIndex(index + 1) : onClose())} />
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
      </div>
    </div>
  )
}
