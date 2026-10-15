import { useRef, useState } from 'react'
import { ZoomIn } from 'lucide-react'
import { AVATAR_ZOOM_MAX, clampCrop, panCrop } from '../../lib/profile/avatarCropCore.js'

const VIEW = 280

/**
 * Обрезка в круг, как в Telegram: фото двигают пальцем, ползунок — увеличение. Наружу — { zoom, cx, cy } в пикселях фото.
 * @param {{ image: { url: string, w: number, h: number }, busy: boolean, onCancel: () => void, onDone: (crop: { zoom: number, cx: number, cy: number }) => void }} props
 */
export function AvatarCropper({ image, busy, onCancel, onDone }) {
  const { w, h } = image
  const [crop, setCrop] = useState(() => ({ ...clampCrop({ w, h, zoom: 1, cx: w / 2, cy: h / 2 }), zoom: 1 }))
  const drag = useRef(null)
  const scale = VIEW / crop.side

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setCrop((c) => ({ ...panCrop({ w, h, zoom: c.zoom, cx: c.cx, cy: c.cy }, dx, dy, VIEW), zoom: c.zoom }))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onZoom = (e) => {
    const zoom = Number(e.target.value)
    setCrop((c) => ({ ...clampCrop({ w, h, zoom, cx: c.cx, cy: c.cy }), zoom }))
  }

  return (
    <div className="avatar-crop">
      <div
        className="avatar-crop__stage"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="avatar-crop-stage"
      >
        <img
          src={image.url}
          alt=""
          draggable={false}
          className="avatar-crop__img"
          style={{ width: w * scale, height: h * scale, transform: `translate(${-crop.sx * scale}px, ${-crop.sy * scale}px)` }}
        />
        <span className="avatar-crop__ring" aria-hidden />
      </div>
      <label className="avatar-crop__zoom">
        <ZoomIn size={18} aria-hidden />
        <input type="range" min="1" max={AVATAR_ZOOM_MAX} step="0.01" value={crop.zoom} onChange={onZoom} aria-label="Увеличение" />
      </label>
      <div className="row td-modal-actions avatar-crop__actions">
        <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn btn-primary btn-touch" disabled={busy} onClick={() => onDone({ zoom: crop.zoom, cx: crop.cx, cy: crop.cy })}>
          {busy ? 'Сохраняем…' : 'Готово'}
        </button>
      </div>
    </div>
  )
}
