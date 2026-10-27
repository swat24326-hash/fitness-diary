import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import {
  STORY_EDIT_PRESETS,
  STORY_EDIT_ZOOM,
  storyEditApplyPreset,
  storyEditDefaults,
  storyEditFilterCss,
} from '../../lib/stories/storyEditCore.js'
import { renderStoryPhotoEdit } from '../../lib/stories/storyPhotoEdit.js'

/**
 * Лёгкий редактор фото перед выкладкой: кадр 9:16, зум/сдвиг, пресеты цвета.
 * Стиль — тот же тёмный полный экран сторис, акцент роли Ядра.
 */
export function StoryComposeEdit({ file, onDone, onCancel }) {
  const stageRef = useRef(null)
  const drag = useRef(null)
  const [url, setUrl] = useState('')
  const [edit, setEdit] = useState(() => storyEditDefaults())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    setEdit(storyEditDefaults())
    setError('')
    return () => URL.revokeObjectURL(u)
  }, [file])

  const setTone = (patch) => setEdit((prev) => ({ ...prev, ...patch, preset: 'custom' }))

  const onPointerDown = (e) => {
    if (busy) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: edit.ox, oy: edit.oy }
  }

  const onPointerMove = (e) => {
    if (!drag.current || busy) return
    const box = stageRef.current?.getBoundingClientRect()
    if (!box?.width || !box?.height) return
    const dx = (e.clientX - drag.current.x) / box.width
    const dy = (e.clientY - drag.current.y) / box.height
    const span = Math.max(0.05, 1 / edit.zoom)
    setEdit((prev) => ({
      ...prev,
      ox: Math.max(-1, Math.min(1, drag.current.ox - dx / span)),
      oy: Math.max(-1, Math.min(1, drag.current.oy - dy / span)),
    }))
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const apply = async () => {
    if (busy || !url) return
    setBusy(true)
    setError('')
    try {
      const photo = await renderStoryPhotoEdit(url, edit)
      onDone({ ...photo, caption: '' })
    } catch (e) {
      setError(e?.message || 'Не получилось сохранить кадр')
      setBusy(false)
    }
  }

  const filter = storyEditFilterCss(edit)
  const posX = 50 + edit.ox * 50
  const posY = 50 + edit.oy * 50

  return (
    <div className="stories-compose-edit" role="dialog" aria-modal="true" aria-label="Правка фото">
      <header className="stories-compose-edit__top">
        <button
          type="button"
          className="stories-compose-edit__icon btn-touch"
          onClick={onCancel}
          disabled={busy}
          aria-label="Отмена"
          title="Отмена"
        >
          <X size={22} aria-hidden />
        </button>
        <div className="stories-compose-edit__heading">
          <strong>Кадр и цвет</strong>
          <span>Как будет в сторис</span>
        </div>
        <button
          type="button"
          className="stories-compose-edit__icon stories-compose-edit__ok btn-touch"
          onClick={() => void apply()}
          disabled={busy}
          aria-label="Готово"
          title="Готово"
        >
          <Check size={22} aria-hidden />
        </button>
      </header>

      <div
        ref={stageRef}
        className="stories-compose-edit__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {url ? (
          <img
            className="stories-compose-edit__img"
            src={url}
            alt=""
            draggable={false}
            style={{
              filter,
              objectPosition: `${posX}% ${posY}%`,
              transform: `scale(${edit.zoom})`,
            }}
          />
        ) : null}
        <div className="stories-compose-edit__veil" aria-hidden />
        <div className="stories-compose-edit__frame" aria-hidden />
      </div>

      <div className="stories-compose-edit__dock">
        <div className="stories-compose-edit__zoom">
          <button
            type="button"
            className="stories-compose-edit__zoom-btn btn-touch"
            disabled={busy || edit.zoom <= STORY_EDIT_ZOOM.min}
            onClick={() => setEdit((p) => ({ ...p, zoom: Math.max(STORY_EDIT_ZOOM.min, +(p.zoom - 0.15).toFixed(2)) }))}
            aria-label="Мельче"
            title="Мельче"
          >
            <Minus size={18} aria-hidden />
          </button>
          <span>Тяните кадр · зум</span>
          <button
            type="button"
            className="stories-compose-edit__zoom-btn btn-touch"
            disabled={busy || edit.zoom >= STORY_EDIT_ZOOM.max}
            onClick={() => setEdit((p) => ({ ...p, zoom: Math.min(STORY_EDIT_ZOOM.max, +(p.zoom + 0.15).toFixed(2)) }))}
            aria-label="Крупнее"
            title="Крупнее"
          >
            <Plus size={18} aria-hidden />
          </button>
        </div>

        <ul className="stories-compose-edit__presets" aria-label="Цвет">
          {STORY_EDIT_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`stories-compose-edit__preset btn-touch${edit.preset === p.id ? ' is-on' : ''}`}
                disabled={busy}
                onClick={() => setEdit((prev) => ({ ...prev, ...storyEditApplyPreset(p.id) }))}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>

        <label className="stories-compose-edit__slider">
          <span>Яркость</span>
          <input
            type="range"
            min={-40}
            max={40}
            value={edit.brightness}
            disabled={busy}
            onChange={(e) => setTone({ brightness: Number(e.target.value) })}
          />
        </label>
        <label className="stories-compose-edit__slider">
          <span>Контраст</span>
          <input
            type="range"
            min={-40}
            max={40}
            value={edit.contrast}
            disabled={busy}
            onChange={(e) => setTone({ contrast: Number(e.target.value) })}
          />
        </label>
        <label className="stories-compose-edit__slider">
          <span>Насыщенность</span>
          <input
            type="range"
            min={-40}
            max={40}
            value={edit.saturation}
            disabled={busy}
            onChange={(e) => setTone({ saturation: Number(e.target.value) })}
          />
        </label>

        {error ? <p className="stories-compose-edit__error">{error}</p> : null}
        <p className="stories-compose-edit__hint">{busy ? 'Сохраняем…' : 'Галочка справа — в ленту'}</p>
      </div>
    </div>
  )
}
