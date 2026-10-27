import { useEffect, useRef, useState } from 'react'
import { Check, Crop, Eraser, Minus, Palette, Pencil, Plus, Undo2, X } from 'lucide-react'
import {
  STORY_EDIT_PRESETS,
  STORY_EDIT_ZOOM,
  storyEditApplyPreset,
  storyEditDefaults,
  storyEditPanByDelta,
  storyEditSetZoom,
} from '../../lib/stories/storyEditCore.js'
import {
  STORY_DRAW_COLORS,
  STORY_DRAW_WIDTHS,
  storyDrawAppendPoint,
  storyDrawDefaults,
  storyDrawNormFromClient,
  storyDrawStartStroke,
  storyDrawUndo,
} from '../../lib/stories/storyEditDraw.js'
import { paintStoryEditPreview, renderStoryPhotoEdit } from '../../lib/stories/storyPhotoEdit.js'

const TOOL_TITLE = {
  crop: { title: 'Кадр', hint: 'Тяните · щипок увеличивает' },
  draw: { title: 'Рисунок', hint: 'Рисуйте пальцем по кадру' },
  color: { title: 'Цвет', hint: 'Пресет или ползунки' },
}

/**
 * Редактор сторис как в Telegram: кадр / рисунок / цвет, превью на canvas 9:16.
 */
export function StoryComposeEdit({ file, onDone, onCancel }) {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const live = useRef(storyEditDefaults())
  const drag = useRef(null)
  const pinch = useRef(null)
  const drawActive = useRef(false)
  const pointers = useRef(new Map())
  const raf = useRef(0)
  const [url, setUrl] = useState('')
  const [edit, setEdit] = useState(() => storyEditDefaults())
  const [pen, setPen] = useState(() => storyDrawDefaults())
  const [tool, setTool] = useState('crop')
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
    setPen(storyDrawDefaults())
    setTool('crop')
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

    if (tool === 'draw') {
      const box = stageRef.current?.getBoundingClientRect()
      if (!box) return
      const point = storyDrawNormFromClient(e.clientX, e.clientY, box)
      drawActive.current = true
      live.current = {
        ...live.current,
        strokes: storyDrawStartStroke(live.current.strokes, {
          color: pen.color,
          width: pen.width,
          point,
        }),
      }
      schedulePaint()
      return
    }

    if (tool !== 'crop') return
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

    if (tool === 'draw' && drawActive.current) {
      const box = stageRef.current?.getBoundingClientRect()
      if (!box) return
      const point = storyDrawNormFromClient(e.clientX, e.clientY, box)
      live.current = {
        ...live.current,
        strokes: storyDrawAppendPoint(live.current.strokes, point),
      }
      schedulePaint()
      return
    }

    if (tool !== 'crop') return
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      live.current = storyEditSetZoom(live.current, pinch.current.zoom * (dist / pinch.current.dist))
      schedulePaint()
      return
    }

    if (!drag.current) return
    const box = stageRef.current?.getBoundingClientRect()
    if (!box?.width || !box?.height) return
    live.current = storyEditPanByDelta(
      { ...live.current, ox: drag.current.ox, oy: drag.current.oy },
      (e.clientX - drag.current.x) / box.width,
      (e.clientY - drag.current.y) / box.height,
    )
    schedulePaint()
  }

  const onPointerUp = (e) => {
    if (tool === 'draw') {
      drawActive.current = false
      setEdit({ ...live.current })
      return
    }
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

  const meta = TOOL_TITLE[tool] || TOOL_TITLE.crop
  const strokeCount = edit.strokes?.length || 0

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
          <strong>{meta.title}</strong>
          <span>{meta.hint}</span>
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
        className={`stories-compose-edit__stage${tool === 'crop' ? ' is-crop' : ''}${tool === 'draw' ? ' is-draw' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="stories-compose-edit__canvas" aria-hidden />
        <div className="stories-compose-edit__veil" aria-hidden />
        <div className="stories-compose-edit__frame" aria-hidden />

        {tool === 'crop' ? (
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
        ) : null}
      </div>

      <div className="stories-compose-edit__dock">
        {tool === 'crop' ? (
          <p className="stories-compose-edit__tool-hint">Сдвиньте фото — в ленту попадёт то, что в рамке</p>
        ) : null}

        {tool === 'draw' ? (
          <div className="stories-compose-edit__draw">
            <ul className="stories-compose-edit__swatches" aria-label="Цвет пера">
              {STORY_DRAW_COLORS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`stories-compose-edit__swatch btn-touch${pen.color === c.hex ? ' is-on' : ''}`}
                    style={{ '--swatch': c.hex }}
                    disabled={busy}
                    onClick={() => setPen((p) => ({ ...p, color: c.hex }))}
                    aria-label={c.label}
                    title={c.label}
                  />
                </li>
              ))}
            </ul>
            <div className="stories-compose-edit__draw-row">
              <div className="stories-compose-edit__widths" role="group" aria-label="Толщина">
                {STORY_DRAW_WIDTHS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`stories-compose-edit__width btn-touch${pen.width === w.w ? ' is-on' : ''}`}
                    disabled={busy}
                    onClick={() => setPen((p) => ({ ...p, width: w.w }))}
                    aria-label={w.label}
                    title={w.label}
                  >
                    <span className={`stories-compose-edit__width-dot stories-compose-edit__width-dot--${w.id}`} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="stories-compose-edit__draw-act btn-touch"
                disabled={busy || !strokeCount}
                onClick={() => commitUi({ ...live.current, strokes: storyDrawUndo(live.current.strokes) })}
                aria-label="Отменить штрих"
                title="Отменить штрих"
              >
                <Undo2 size={18} aria-hidden />
              </button>
              <button
                type="button"
                className="stories-compose-edit__draw-act btn-touch"
                disabled={busy || !strokeCount}
                onClick={() => commitUi({ ...live.current, strokes: [] })}
                aria-label="Стереть всё"
                title="Стереть всё"
              >
                <Eraser size={18} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {tool === 'color' ? (
          <>
            <ul className="stories-compose-edit__presets" aria-label="Пресеты">
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
          </>
        ) : null}

        {error ? <p className="stories-compose-edit__error">{error}</p> : null}

        <nav className="stories-compose-edit__tools" aria-label="Инструменты">
          <button
            type="button"
            className={`stories-compose-edit__tool btn-touch${tool === 'crop' ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => setTool('crop')}
            aria-label="Кадрирование"
            title="Кадрирование"
            aria-pressed={tool === 'crop'}
          >
            <Crop size={22} aria-hidden />
            <span>Кадр</span>
          </button>
          <button
            type="button"
            className={`stories-compose-edit__tool btn-touch${tool === 'draw' ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => setTool('draw')}
            aria-label="Рисование"
            title="Рисование"
            aria-pressed={tool === 'draw'}
          >
            <Pencil size={22} aria-hidden />
            <span>Рисунок</span>
          </button>
          <button
            type="button"
            className={`stories-compose-edit__tool btn-touch${tool === 'color' ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => setTool('color')}
            aria-label="Цветокоррекция"
            title="Цветокоррекция"
            aria-pressed={tool === 'color'}
          >
            <Palette size={22} aria-hidden />
            <span>Цвет</span>
          </button>
          <button
            type="button"
            className="stories-compose-edit__tool stories-compose-edit__tool--done btn-touch"
            disabled={busy || !ready}
            onClick={() => void apply()}
            aria-label="Готово"
            title="Готово"
          >
            <Check size={22} aria-hidden />
            <span>{busy ? '…' : 'Готово'}</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
