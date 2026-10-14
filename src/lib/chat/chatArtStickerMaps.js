/**
 * Карты смещения для анимированных стикеров (feDisplacementMap): какая часть рисунка и куда двигается.
 * Координаты — в системе рисунка 300×300. Значение канала: 128 = на месте, сила сдвига = (v) * scale / 2.
 * Без React и DOM — пиксели собирает компонент (canvas), проверка — scripts/verify-chat-art-stickers.mjs.
 */

export const ART_SIZE = 300

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

/** Профиль по высоте: точки [доля 0..1, сила 0..1], между ними — плавный переход. */
function profile(points, t) {
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1]
    const [t1, v1] = points[i]
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0))
  }
  return points[points.length - 1][1]
}

/** Расстояние от точки до отрезка и положение проекции вдоль него (0 у начала, 1 у конца). */
function segment(x, y, sx, sy, ex, ey) {
  const ax = ex - sx
  const ay = ey - sy
  const t = ((x - sx) * ax + (y - sy) * ay) / (ax * ax + ay * ay)
  const tc = Math.min(1, Math.max(0, t))
  return { t, dist: Math.hypot(x - (sx + ax * tc), y - (sy + ay * tc)) }
}

const DANCE_HIPS_X = [[0, 0.45], [0.3, 0.5], [0.45, 1], [0.55, 1], [0.66, 0.35], [0.74, 0], [1, 0]]
const DANCE_HIPS_Y = [[0, 0.8], [0.3, 0.85], [0.45, 1], [0.55, 1], [0.66, 0.35], [0.74, 0], [1, 0]]

function strutArm(x, y, sx, sy, ex, ey, half, soft) {
  const s = segment(x, y, sx, sy, ex, ey)
  const along = 0.18 + 0.82 * smooth(s.t / 0.9)
  return (
    along *
    (1 - smooth((s.dist - half) / soft)) *
    (1 - smooth((-s.t - 0.05) / 0.25)) *
    (1 - smooth((s.t - 1.02) / 0.22))
  )
}

/** @type {Record<string, { w: number, h: number, at: (x: number, y: number) => [number, number] }>} */
export const ART_MAPS = Object.freeze({
  // Танец: бёдра ходят дугой, колени почти на месте (сдвиг зависит только от высоты).
  'dance-x': { w: 4, h: ART_SIZE, at: (_x, y) => [profile(DANCE_HIPS_X, y / (ART_SIZE - 1)), 0] },
  'dance-y': { w: 4, h: ART_SIZE, at: (_x, y) => [0, profile(DANCE_HIPS_Y, y / (ART_SIZE - 1))] },
  // Шейкер: предплечье у стенки — по диагонали вверх-вперёд, корпус над стенкой чуть качается; плечо и грудь на месте.
  'shake-arm': {
    w: ART_SIZE,
    h: ART_SIZE,
    at: (x, y) => {
      const body = 0.22 * (1 - smooth((y - 160) / 12))
      const arm =
        smooth((y - 138) / 22) * (1 - smooth((x - 104) / 8)) * smooth((x - 78) / 8) * (1 - smooth((y - 168) / 8))
      const v = Math.min(1, body + 0.78 * arm)
      return [-v, v]
    },
  },
  // Утка: глаза и клюв сдвигаются целиком (поворот головы), сжимается только гладкая кожа у контура.
  'no-legs-yaw': {
    w: ART_SIZE,
    h: ART_SIZE,
    at: (x, y) => [1 - smooth((Math.hypot(x - 151, y - 70) / 34 - 0.74) / 0.23), 0],
  },
  // Утка: дрожат тонкие голени, тело и лапки на месте.
  'no-legs-legs': {
    w: ART_SIZE,
    h: ART_SIZE,
    at: (x, y) => {
      const legs = smooth((y - 212) / 8) * (1 - smooth((y - 246) / 8))
      const band = 1 - smooth(Math.abs(x - 129) / 14 - 0.4) + (1 - smooth(Math.abs(x - 173) / 14 - 0.4))
      return [Math.min(1, legs * band), 0]
    },
  },
  // Походка: руки маятником от плеча в противофазе (вперёд = влево и вверх), плечо подхватывает перекат.
  'strut-arms': {
    w: ART_SIZE,
    h: ART_SIZE,
    at: (x, y) => {
      const v = strutArm(x, y, 111, 103, 84, 178, 15, 6) - strutArm(x, y, 187, 100, 218, 183, 18, 7)
      return [v, 0.55 * v]
    },
  },
})

/**
 * RGBA-пиксели карты: R — сдвиг по x, G — по y (128 = на месте).
 * @param {string} name
 * @returns {{ w: number, h: number, data: Uint8ClampedArray } | null}
 */
export function buildArtMapPixels(name) {
  const map = ART_MAPS[name]
  if (!map) return null
  const data = new Uint8ClampedArray(map.w * map.h * 4)
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const [vx, vy] = map.at(x, y)
      const i = (y * map.w + x) * 4
      data[i] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, vx)))
      data[i + 1] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, vy)))
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  return { w: map.w, h: map.h, data }
}
