import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, X } from 'lucide-react'
import { STORY_CAPTION_MAX, STORY_MAX_FRAMES } from '../../lib/stories/storyClubCore.js'
import { prepareStoryPhoto } from '../../lib/stories/storyPhotoPrepare.js'

/**
 * Выкладка сторис клуба как в Telegram: фото и подпись.
 * Срок всегда сутки, без кнопки у клиента — задаёт сервер.
 */
export function StoryCompose({ busy, error, onClose, onSubmit }) {
  const [frames, setFrames] = useState([])
  const [active, setActive] = useState(0)
  const [localError, setLocalError] = useState('')
  const fileRef = useRef(null)

  const addFiles = async (list) => {
    setLocalError('')
    const next = [...frames]
    for (const file of list) {
      if (next.length >= STORY_MAX_FRAMES) break
      try {
        const photo = await prepareStoryPhoto(file)
        next.push({ ...photo, caption: '' })
      } catch (e) {
        setLocalError(e?.message || 'Фото не открылось — попробуйте другое')
        break
      }
    }
    setFrames(next)
    if (next.length > frames.length) setActive(next.length - 1)
  }

  const current = frames[active] ?? null
  const canAdd = frames.length < STORY_MAX_FRAMES

  return createPortal(
    <div className="stories-compose" role="dialog" aria-modal="true" aria-label="Новая сторис">
      <form
        className="stories-compose__shell"
        onSubmit={(e) => {
          e.preventDefault()
          if (!frames.length) {
            setLocalError('Добавьте хотя бы одно фото')
            return
          }
          onSubmit({
            frames: frames.map(({ data, w, h, caption }) => ({ data, w, h, caption })),
          })
        }}
      >
        <header className="stories-compose__top">
          <button
            type="button"
            className="stories-compose__icon btn-touch"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X size={22} aria-hidden />
          </button>
          <div className="stories-compose__heading">
            <strong>Новая сторис</strong>
            <span>24 часа · без кнопки</span>
          </div>
          <span className="stories-compose__top-spacer" aria-hidden />
        </header>

        <div className="stories-compose__stage">
          {current ? (
            <img
              className="stories-compose__preview"
              src={`data:image/jpeg;base64,${current.data}`}
              alt=""
            />
          ) : (
            <button
              type="button"
              className="stories-compose__empty btn-touch"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={36} aria-hidden />
              <span>Добавить фото</span>
              <small>До {STORY_MAX_FRAMES} кадров</small>
            </button>
          )}
        </div>

        {frames.length ? (
          <ul className="stories-compose__film" aria-label="Кадры">
            {frames.map((frame, i) => (
              <li key={i} className={i === active ? 'is-active' : undefined}>
                <button
                  type="button"
                  className="stories-compose__thumb btn-touch"
                  onClick={() => setActive(i)}
                  aria-label={`Кадр ${i + 1}`}
                  aria-current={i === active ? 'true' : undefined}
                >
                  <img src={`data:image/jpeg;base64,${frame.data}`} alt="" />
                </button>
                <button
                  type="button"
                  className="stories-compose__drop btn-touch"
                  aria-label={`Убрать кадр ${i + 1}`}
                  title={`Убрать кадр ${i + 1}`}
                  disabled={busy}
                  onClick={() => {
                    const next = frames.filter((_, n) => n !== i)
                    setFrames(next)
                    setActive((prev) => {
                      if (!next.length) return 0
                      if (prev > i) return prev - 1
                      if (prev === i) return Math.min(i, next.length - 1)
                      return prev
                    })
                  }}
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
            {canAdd ? (
              <li className="stories-compose__film-add">
                <button
                  type="button"
                  className="stories-compose__thumb stories-compose__thumb--add btn-touch"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-label="Ещё фото"
                  title="Ещё фото"
                >
                  <ImagePlus size={22} aria-hidden />
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {current ? (
          <label className="stories-compose__caption">
            <span className="u-visually-hidden">Подпись к кадру {active + 1}</span>
            <input
              value={current.caption}
              maxLength={STORY_CAPTION_MAX}
              placeholder="Подпись (необязательно)"
              disabled={busy}
              onChange={(e) =>
                setFrames(frames.map((item, n) => (n === active ? { ...item, caption: e.target.value } : item)))
              }
            />
          </label>
        ) : null}

        {localError || error ? <p className="stories-compose__error">{localError || error}</p> : null}

        <footer className="stories-compose__bar">
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy || !frames.length}>
            {busy ? 'Выкладываем…' : 'Опубликовать'}
          </button>
        </footer>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles([...e.target.files])
            e.target.value = ''
          }}
        />
      </form>
    </div>,
    document.body,
  )
}
