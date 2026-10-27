import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import {
  STORY_EDIT_PRESETS,
  STORY_EDIT_ZOOM,
  storyEditApplyPreset,
  storyEditDefaults,
  storyEditPanByDelta,
  storyEditSetZoom,
} from '../../lib/stories/storyEditCore.js'
import { paintStoryEditPreview, renderStoryPhotoEdit } from '../../lib/stories/storyPhotoEdit.js'

/**
 * Редактор фото сторис как в Telegram: тяни кадр, щипок/± зум, пресеты цвета.
 * Превью на canvas (тот же кадр, что в ленту) — без CSS filter/transform, иначе WebView даёт чёрный экран.
 */
export function StoryComposeEdit({ file, onDone, onCancel }) {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const live = useRef(storyEditDefaults())
  const drag = useRef(null)
  const pinch = useRef(null)
  const pointers = useRef(new Map())
  const raf = useRef(0)
  const [url, setUrl] = useState('')
  const [edit, setEdit] = useState(() => storyEditDefaults())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  const paint = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return
    paintStoryEditPreview(canvas, img, live.current)
  }

  const schedulePaint = () => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      paint()
    })
  }

  const commitUi = (next) => {
    live.current = next
    setEdit(next)
    schedulePaint()
  }

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    const defaults = storyEditDefaults()
    live.current = defaults
    setEdit(defaults)
    setError('')
    setReady(false)
    setBusy(false)

    const img = new Image()
    imgRef.current = img
    img.onload = () => {
      setReady(true)
      schedulePaint()
    }
    img.onerror = () => setError('Фото не открылось — попробуйте другое')
    img.src = u

    return () => {
      URL.revokeObjectURL(u)
      img.onload = null
      img.onerror = null
      imgRef.current = null
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [file])

  useEffect(() => {
    if (!ready) return
    const onResize = () => schedulePaint()
    window.addEventListener('resize', onResize)
    schedulePaint()
    return () => window.removeEventListener('resize', onResize)
  }, [ready])

  const bumpZoom = (delta) => {
    commitUi(storyEditSetZoom(live.current, +(live.current.zoom + delta).toFixed(2)))
  }

  const onPointerDown = (e) => {
    if (busy || !ready) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox: live.current.ox, oy: live.current.oy }
      pinch.current = null
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      pinch.current = { dist, zoom: live.current.zoom }
      drag.current = null
    }
  }

  const onPointerMove = (e) => {
    if (busy || !ready) return
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const nextZoom = pinch.current.zoom * (dist / pinch.current.dist)
      live.current = storyEditSetZoom(live.current, nextZoom)
      schedulePaint()
      return
    }

    if (!drag.current) return
    const box = stageRef.current?.getBoundingClientRect()
    if (!box?.width || !box?.height) return
    const dxNorm = (e.clientX - drag.current.x) / box.width
    const dyNorm = (e.clientY - drag.current.y) / box.height
    live.current = storyEditPanByDelta(
      { ...live.current, ox: drag.current.ox, oy: drag.current.oy },
      dxNorm,
      dyNorm,
    )
    schedulePaint()
  }

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      const only = [...pointers.current.values()][0]
      drag.current = { x: only.x, y: only.y, ox: live.current.ox, oy: live.current.oy }
    } else {
      drag.current = null
    }
    setEdit({ ...live.current })
  }

  const apply = async () => {
    if (busy || !url || !ready) return
    setBusy(true)
    setError('')
    try {
      const photo = await renderStoryPhotoEdit(url, live.current)
      onDone({ ...photo, caption: '' })
    } catch (err) {
      setError(err?.message || 'Не получилось сохранить кадр')
      setBusy(false)
    }
  }

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
          <strong>Кадр</strong>
          <span>Тяните · щипок увеличивает</span>
        </p>
        <button
          type="button"
          className="stories-compose-edit__icon stories-compose-edit__ok btn-touch"
          onClick={() => void apply()}
          disabled={busy || !ready}
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
        <canvas ref={canvasRef} className="stories-compose-edit__canvas" aria-hidden />
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
                onClick={() => commitUi({ ...live.current, ...storyEditApplyPreset(p.id) })}
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
              onChange={(e) =>
                commitUi({ ...live.current, brightness: Number(e.target.value), preset: 'custom' })
              }
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
              onChange={(e) =>
                commitUi({ ...live.current, contrast: Number(e.target.value), preset: 'custom' })
              }
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
              onChange={(e) =>
                commitUi({ ...live.current, saturation: Number(e.target.value), preset: 'custom' })
              }
            />
          </label>
        </div>

        {error ? <p className="stories-compose-edit__error">{error}</p> : null}

        <button
          type="button"
          className="stories-compose-edit__done btn-touch"
          onClick={() => void apply()}
          disabled={busy || !ready}
        >
          <Check size={20} aria-hidden />
          {busy ? 'Сохраняем…' : 'Готово'}
        </button>
      </div>
    </div>
  )
}
