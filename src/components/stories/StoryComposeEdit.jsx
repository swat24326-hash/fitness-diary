import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import {
  STORY_EDIT_PRESETS,
  STORY_EDIT_ZOOM,
  clampStoryEdit,
  storyEditApplyPreset,
  storyEditDefaults,
  storyEditFilterCss,
} from '../../lib/stories/storyEditCore.js'
import { renderStoryPhotoEdit } from '../../lib/stories/storyPhotoEdit.js'

/**
 * Лёгкий редактор фото: кадр 9:16, зум/сдвиг, пресеты цвета.
 * filter и transform на разных узлах — иначе на телефоне бывает чёрный экран.
 * Эргономика: зум у правого края кадра, «Готово» внизу под большой палец.
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

  const bumpZoom = (delta) => {
    setEdit((prev) => {
      const zoom = clampStoryEdit(+(prev.zoom + delta).toFixed(2), STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max)
      return { ...prev, zoom }
    })
  }

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
      ox: clampStoryEdit(drag.current.ox - dx / span, -1, 1),
      oy: clampStoryEdit(drag.current.oy - dy / span, -1, 1),
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
  /* Сдвиг в % от кадра; зум только scale — без object-position (он ломал превью на телефоне). */
  const shiftX = -edit.ox * 12 * edit.zoom
  const shiftY = -edit.oy * 12 * edit.zoom

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
        <p className="stories-compose-edit__heading">
          <strong>Правка кадра</strong>
          <span>Тяните фото · зум справа</span>
        </p>
        <span className="stories-compose-edit__top-spacer" aria-hidden />
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
          <div
            className="stories-compose-edit__pan"
            style={{ transform: `translate3d(${shiftX}%, ${shiftY}%, 0) scale(${edit.zoom})` }}
          >
            <img className="stories-compose-edit__img" src={url} alt="" draggable={false} style={{ filter }} />
          </div>
        ) : null}
        <div className="stories-compose-edit__veil" aria-hidden />
        <div className="stories-compose-edit__frame" aria-hidden />

        <div className="stories-compose-edit__zoom" role="group" aria-label="Размер">
          <button
            type="button"
            className="stories-compose-edit__zoom-btn btn-touch"
            disabled={busy || edit.zoom >= STORY_EDIT_ZOOM.max}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => bumpZoom(0.15)}
            aria-label="Крупнее"
            title="Крупнее"
          >
            <Plus size={20} aria-hidden />
          </button>
          <button
            type="button"
            className="stories-compose-edit__zoom-btn btn-touch"
            disabled={busy || edit.zoom <= STORY_EDIT_ZOOM.min}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => bumpZoom(-0.15)}
            aria-label="Мельче"
            title="Мельче"
          >
            <Minus size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div className="stories-compose-edit__dock">
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

        <div className="stories-compose-edit__tones" aria-label="Точная настройка">
          <label className="stories-compose-edit__slider">
            <span>Ярк.</span>
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
            <span>Контр.</span>
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
            <span>Цвет</span>
            <input
              type="range"
              min={-40}
              max={40}
              value={edit.saturation}
              disabled={busy}
              onChange={(e) => setTone({ saturation: Number(e.target.value) })}
            />
          </label>
        </div>

        {error ? <p className="stories-compose-edit__error">{error}</p> : null}

        <button
          type="button"
          className="stories-compose-edit__done btn-touch"
          onClick={() => void apply()}
          disabled={busy || !url}
        >
          <Check size={20} aria-hidden />
          {busy ? 'Сохраняем…' : 'Готово'}
        </button>
      </div>
    </div>
  )
}
