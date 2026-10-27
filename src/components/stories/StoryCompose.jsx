import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, X } from 'lucide-react'
import {
  STORY_CAPTION_MAX,
  STORY_DEFAULT_CTA,
  STORY_MAX_FRAMES,
} from '../../lib/stories/storyClubCore.js'
import { prepareStoryVideo } from '../../lib/stories/storyVideoPrepare.js'
import { isStoryVideoSupported } from '../../lib/stories/storyVideoRecord.js'
import { StoryComposeEdit } from './StoryComposeEdit.jsx'
import { StoryComposeRecord } from './StoryComposeRecord.jsx'

function isVideoFile(file) {
  return String(file?.type || '').startsWith('video/')
}

function previewSrc(frame) {
  if (frame.kind === 'video') return frame.previewUrl || ''
  return `data:image/jpeg;base64,${frame.data}`
}

/**
 * Выкладка сторис клуба: один кадр (правка фото) → вид / кнопка у клиента → опубликовать.
 */
export function StoryCompose({ busy, error, onClose, onSubmit }) {
  const [frames, setFrames] = useState([])
  const [active, setActive] = useState(0)
  const [label, setLabel] = useState('promo')
  const [cta, setCta] = useState(STORY_DEFAULT_CTA)
  const [localError, setLocalError] = useState('')
  const [record, setRecord] = useState(false)
  const [editQueue, setEditQueue] = useState([])
  const fileRef = useRef(null)
  const canRecord = isStoryVideoSupported()

  const framesRef = useRef(frames)
  framesRef.current = frames
  useEffect(
    () => () => {
      for (const frame of framesRef.current) {
        if (frame.previewUrl) URL.revokeObjectURL(frame.previewUrl)
      }
    },
    [],
  )

  const addFrames = (items) => {
    setLocalError('')
    setFrames((prev) => {
      const next = [...prev, ...items].slice(0, STORY_MAX_FRAMES)
      if (next.length > prev.length) setActive(next.length - 1)
      return next
    })
  }

  const addFiles = async (list) => {
    setLocalError('')
    const room = STORY_MAX_FRAMES - frames.length
    if (room <= 0) return
    const photos = []
    const videos = []
    for (const file of list) {
      if (photos.length + videos.length >= room) break
      if (isVideoFile(file)) videos.push(file)
      else photos.push(file)
    }
    const added = []
    for (const file of videos) {
      try {
        added.push(await prepareStoryVideo(file))
      } catch (e) {
        setLocalError(e?.message || 'Видео не открылось — попробуйте другое')
        break
      }
    }
    if (added.length) addFrames(added)
    if (photos.length) setEditQueue((q) => [...q, ...photos].slice(0, room))
  }

  const dropFrame = (i) => {
    const doomed = frames[i]
    if (doomed?.previewUrl) URL.revokeObjectURL(doomed.previewUrl)
    const next = frames.filter((_, n) => n !== i)
    setFrames(next)
    setActive((prev) => {
      if (!next.length) return 0
      if (prev > i) return prev - 1
      if (prev === i) return Math.min(i, next.length - 1)
      return prev
    })
  }

  const current = frames[active] ?? null
  const canAdd = frames.length < STORY_MAX_FRAMES
  const editing = editQueue[0] ?? null

  if (editing) {
    return createPortal(
      <StoryComposeEdit
        file={editing}
        onCancel={() => setEditQueue((q) => q.slice(1))}
        onDone={(frame) => {
          addFrames([frame])
          setEditQueue((q) => q.slice(1))
        }}
      />,
      document.body,
    )
  }

  if (record) {
    return createPortal(
      <StoryComposeRecord
        onCancel={() => setRecord(false)}
        onDone={(frame) => {
          addFrames([{ ...frame, caption: '' }])
          setRecord(false)
        }}
      />,
      document.body,
    )
  }

  return createPortal(
    <div className="stories-compose" role="dialog" aria-modal="true" aria-label="Новая сторис">
      <form
        className="stories-compose__shell"
        onSubmit={(e) => {
          e.preventDefault()
          if (!frames.length) {
            setLocalError('Добавьте хотя бы одно фото или видео')
            return
          }
          onSubmit({
            label,
            cta,
            frames: frames.map((frame) =>
              frame.kind === 'video'
                ? { kind: 'video', blob: frame.blob, mime: frame.mime, sec: frame.sec, caption: frame.caption }
                : { kind: 'photo', data: frame.data, w: frame.w, h: frame.h, caption: frame.caption },
            ),
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
            <span>24 часа · одно фото или видео</span>
          </div>
          <span className="stories-compose__top-spacer" aria-hidden />
        </header>

        <div className="stories-compose__stage">
          {current ? (
            current.kind === 'video' ? (
              <video className="stories-compose__preview" src={previewSrc(current)} muted playsInline controls />
            ) : (
              <img className="stories-compose__preview" src={previewSrc(current)} alt="" />
            )
          ) : (
            <p className="stories-compose__hint">Одно фото или видео · фото можно подрезать</p>
          )}
        </div>

        <div className="stories-compose__dock">
          {frames.length ? (
            <ul className="stories-compose__film" aria-label="Кадр">
              {frames.map((frame, i) => (
                <li key={i} className={i === active ? 'is-active' : undefined}>
                  <button
                    type="button"
                    className="stories-compose__thumb btn-touch"
                    onClick={() => setActive(i)}
                    aria-label={`Кадр ${i + 1}`}
                    aria-current={i === active ? 'true' : undefined}
                  >
                    {frame.kind === 'video' ? (
                      <video src={previewSrc(frame)} muted playsInline preload="metadata" />
                    ) : (
                      <img src={previewSrc(frame)} alt="" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="stories-compose__drop btn-touch"
                    aria-label={`Убрать кадр ${i + 1}`}
                    title={`Убрать кадр ${i + 1}`}
                    disabled={busy}
                    onClick={() => dropFrame(i)}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {canAdd ? (
            <div className="stories-compose__actions" role="group" aria-label="Добавить кадр">
              <button
                type="button"
                className="stories-compose__action btn-touch"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Галерея"
                title="Галерея"
              >
                <ImagePlus size={26} aria-hidden />
              </button>
              {canRecord ? (
                <button
                  type="button"
                  className="stories-compose__action stories-compose__action--cam btn-touch"
                  onClick={() => setRecord(true)}
                  disabled={busy}
                  aria-label="Снять видео"
                  title="Снять видео"
                >
                  <Camera size={26} aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}

          {current ? (
            <>
              <div className="stories-compose__meta">
                <label>
                  Вид
                  <select value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)}>
                    <option value="promo">Акция</option>
                    <option value="news">Новость</option>
                  </select>
                </label>
                <label>
                  Кнопка у клиента
                  <select value={cta} disabled={busy} onChange={(e) => setCta(e.target.value)}>
                    <option value="none">Без кнопки</option>
                    <option value="chat">Написать менеджеру</option>
                    <option value="membership">Мой абонемент</option>
                  </select>
                </label>
              </div>
              <label className="stories-compose__caption">
                <span className="u-visually-hidden">Подпись</span>
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
            </>
          ) : null}

          {localError || error ? <p className="stories-compose__error">{localError || error}</p> : null}

          <footer className="stories-compose__bar">
            <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            {frames.length ? (
              <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
                {busy ? 'Выкладываем…' : 'Опубликовать'}
              </button>
            ) : null}
          </footer>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addFiles([file])
            e.target.value = ''
          }}
        />
      </form>
    </div>,
    document.body,
  )
}
