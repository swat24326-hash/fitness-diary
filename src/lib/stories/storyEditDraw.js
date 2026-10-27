/**
 * Рисование поверх кадра сторис (как перо в Telegram).
 * Точки в долях кадра 0…1 — одинаково для превью и экспорта.
 */
import { clampStoryEdit, storyEditPreviewDest } from './storyEditCore.js'

export const STORY_DRAW_COLORS = Object.freeze([
  { id: 'white', hex: '#ffffff', label: 'Белый' },
  { id: 'black', hex: '#111111', label: 'Чёрный' },
  { id: 'green', hex: '#34d399', label: 'Зелёный' },
  { id: 'yellow', hex: '#fbbf24', label: 'Жёлтый' },
  { id: 'red', hex: '#f87171', label: 'Красный' },
])

export const STORY_DRAW_WIDTHS = Object.freeze([
  { id: 's', w: 0.012, label: 'Тонко' },
  { id: 'm', w: 0.024, label: 'Средне' },
  { id: 'l', w: 0.04, label: 'Жирно' },
])

export const STORY_DRAW_MAX_STROKES = 48

export function storyDrawDefaults() {
  return {
    color: STORY_DRAW_COLORS[0].hex,
    width: STORY_DRAW_WIDTHS[1].w,
    strokes: [],
  }
}

/** Локальные px сцены → доля кадра 9:16. */
export function storyDrawNormPoint(localX, localY, dest) {
  const dw = Math.max(1, dest?.dw || 1)
  const dh = Math.max(1, dest?.dh || 1)
  return {
    x: clampStoryEdit((Number(localX) - (dest?.dx || 0)) / dw, 0, 1),
    y: clampStoryEdit((Number(localY) - (dest?.dy || 0)) / dh, 0, 1),
  }
}

export function storyDrawNormFromClient(clientX, clientY, stageBox) {
  if (!stageBox?.width || !stageBox?.height) return { x: 0.5, y: 0.5 }
  const dest = storyEditPreviewDest(stageBox.width, stageBox.height)
  return storyDrawNormPoint(clientX - stageBox.left, clientY - stageBox.top, dest)
}

export function storyDrawShouldAddPoint(prev, next, minDist = 0.004) {
  if (!prev || !next) return true
  return Math.hypot(next.x - prev.x, next.y - prev.y) >= minDist
}

export function storyDrawStartStroke(strokes, { color, width, point }) {
  const list = Array.isArray(strokes) ? strokes.slice() : []
  const stroke = {
    color: color || STORY_DRAW_COLORS[0].hex,
    width: clampStoryEdit(width ?? STORY_DRAW_WIDTHS[1].w, 0.006, 0.08),
    points: point ? [point] : [],
  }
  list.push(stroke)
  while (list.length > STORY_DRAW_MAX_STROKES) list.shift()
  return list
}

export function storyDrawAppendPoint(strokes, point) {
  if (!point || !Array.isArray(strokes) || !strokes.length) return strokes || []
  const list = strokes.slice()
  const last = { ...list[list.length - 1], points: (list[list.length - 1].points || []).slice() }
  const prev = last.points[last.points.length - 1]
  if (!storyDrawShouldAddPoint(prev, point)) return strokes
  last.points.push(point)
  list[list.length - 1] = last
  return list
}

export function storyDrawUndo(strokes) {
  if (!Array.isArray(strokes) || !strokes.length) return []
  return strokes.slice(0, -1)
}

/**
 * Нарисовать штрихи в прямоугольнике кадра (превью или экспорт).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{ color?: string, width?: number, points?: Array<{ x: number, y: number }> }>} strokes
 */
export function paintStoryDrawStrokes(ctx, strokes, dx, dy, dw, dh) {
  if (!ctx || !Array.isArray(strokes) || !strokes.length) return
  const base = Math.min(dw, dh)
  for (const stroke of strokes) {
    const pts = stroke?.points
    if (!pts?.length) continue
    const w = clampStoryEdit(stroke.width ?? STORY_DRAW_WIDTHS[1].w, 0.006, 0.08) * base
    ctx.save()
    ctx.strokeStyle = stroke.color || STORY_DRAW_COLORS[0].hex
    ctx.fillStyle = stroke.color || STORY_DRAW_COLORS[0].hex
    ctx.lineWidth = Math.max(1, w)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(dx + pts[0].x * dw, dy + pts[0].y * dh, Math.max(1, w / 2), 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(dx + pts[0].x * dw, dy + pts[0].y * dh)
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(dx + pts[i].x * dw, dy + pts[i].y * dh)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}
