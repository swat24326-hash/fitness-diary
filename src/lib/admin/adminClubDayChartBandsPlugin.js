/**
 * Вертикальные полосы выходных: строго от X первой точки до X последней
 * (сб–вс = между этими точками, без захвата соседних будней).
 * «Сегодня» — узкая колонка + линия по центру.
 *
 * Конфиг: `options.plugins.adminClubDayBandsV2.flags`
 */
export const ADMIN_CLUB_DAY_BANDS_PLUGIN_ID = 'adminClubDayBandsV2'

export const adminClubDayBandsPlugin = {
  id: ADMIN_CLUB_DAY_BANDS_PLUGIN_ID,
  beforeDatasetsDraw(chart) {
    const flags = chart?.options?.plugins?.[ADMIN_CLUB_DAY_BANDS_PLUGIN_ID]?.flags
    if (!Array.isArray(flags) || !flags.length) return
    const { ctx, chartArea, scales } = chart
    const x = scales?.x
    if (!ctx || !chartArea || !x) return

    const n = flags.length
    const weekendRuns = mergeFlagRuns(flags, (f) => Boolean(f?.weekend))

    for (const run of weekendRuns) {
      const startPx = x.getPixelForValue(run.start)
      const endPx = x.getPixelForValue(run.end)
      if (!Number.isFinite(startPx) || !Number.isFinite(endPx)) continue

      let left
      let right
      if (run.start === run.end) {
        // Один выходной в срезе: узко вокруг точки, не дальше середины к соседу.
        const half = categoryHalfStep(x, run.start, n, chartArea) * 0.5
        left = startPx - half
        right = startPx + half
      } else {
        left = Math.min(startPx, endPx)
        right = Math.max(startPx, endPx)
      }
      left = Math.max(left, chartArea.left)
      right = Math.min(right, chartArea.right)
      if (!(right > left)) continue

      ctx.save()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top)
      // Края = точки выходных — видно, что полоса не вылезает в будни.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left, chartArea.top)
      ctx.lineTo(left, chartArea.bottom)
      ctx.moveTo(right, chartArea.top)
      ctx.lineTo(right, chartArea.bottom)
      ctx.stroke()
      ctx.restore()
    }

    for (let i = 0; i < n; i++) {
      if (!flags[i]?.today) continue
      const center = x.getPixelForValue(i)
      if (!Number.isFinite(center)) continue
      const half = categoryHalfStep(x, i, n, chartArea) * 0.5
      const left = Math.max(center - half, chartArea.left)
      const right = Math.min(center + half, chartArea.right)
      ctx.save()
      ctx.fillStyle = 'rgba(212, 180, 90, 0.16)'
      if (right > left) {
        ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top)
      }
      ctx.strokeStyle = 'rgba(212, 180, 90, 0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(center, chartArea.top)
      ctx.lineTo(center, chartArea.bottom)
      ctx.stroke()
      ctx.restore()
    }
  },
}

/** @visibleForTesting */
export function mergeWeekendRuns(flags) {
  return mergeFlagRuns(flags, (f) => Boolean(f?.weekend))
}

/**
 * @param {Array<{ weekend?: boolean, today?: boolean }>} flags
 * @param {(f: { weekend?: boolean, today?: boolean }) => boolean} pred
 */
function mergeFlagRuns(flags, pred) {
  /** @type {Array<{ start: number, end: number }>} */
  const runs = []
  let start = -1
  for (let i = 0; i < flags.length; i++) {
    if (pred(flags[i])) {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push({ start, end: i - 1 })
      start = -1
    }
  }
  if (start >= 0) runs.push({ start, end: flags.length - 1 })
  return runs
}

function categoryHalfStep(xScale, index, count, chartArea) {
  const c = xScale.getPixelForValue(index)
  const prev = index > 0 ? xScale.getPixelForValue(index - 1) : null
  const next = index < count - 1 ? xScale.getPixelForValue(index + 1) : null
  if (prev != null && next != null) return Math.min(c - prev, next - c) / 2
  if (next != null) return Math.abs(next - c) / 2
  if (prev != null) return Math.abs(c - prev) / 2
  return Math.max((chartArea.right - chartArea.left) / Math.max(count * 2, 2), 4)
}
