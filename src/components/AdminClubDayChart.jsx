import { useMemo } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import {
  ADMIN_CLUB_DAY_BANDS_PLUGIN_ID,
  adminClubDayBandsPlugin,
} from '../lib/admin/adminClubDayChartBandsPlugin.js'
import { buildAdminClubDayChartSeries } from '../lib/admin/adminClubDayChartCore.js'
import { formatDateRu, todayInTimeZoneIso } from '../lib/dateRu'
import '../styles/admin-club-day-chart.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)
// Старый id мог остаться в реестре после HMR — снимаем оба, вешаем актуальный.
for (const id of ['adminClubDayBands', ADMIN_CLUB_DAY_BANDS_PLUGIN_ID]) {
  const prev = ChartJS.registry.plugins.get(id)
  if (prev) ChartJS.unregister(prev)
}
ChartJS.register(adminClubDayBandsPlugin)

const ACCENT = '#d4b45a'
const ACCENT_SOFT = 'rgba(212, 180, 90, 0.16)'
const AVG = 'rgba(226, 232, 240, 0.55)'
const MUTED = 'rgba(148, 163, 158, 0.95)'
const MUTED_SOFT = 'rgba(148, 163, 158, 0.08)'
const TICK = 'rgba(226, 232, 240, 0.62)'
const TICK_WEEKEND = 'rgba(226, 232, 240, 0.38)'
const GRID = 'rgba(255, 255, 255, 0.05)'

/**
 * Минималистичный график тренировок по дням (оси X/Y).
 * @param {{
 *   byDay: Array<{ date: string, completed?: number, draft?: number }>,
 *   prevByDay?: Array<{ date: string, completed?: number, draft?: number }>|null,
 * }} props
 */
export function AdminClubDayChart({ byDay, prevByDay = null }) {
  const todayIso = todayInTimeZoneIso()
  const series = useMemo(
    () => buildAdminClubDayChartSeries(byDay, { todayIso, prevByDay }),
    [byDay, prevByDay, todayIso],
  )

  const chartBody = useMemo(() => {
    const pointR = series.pointCount > 40 ? 0 : series.pointCount > 20 ? 2.5 : 3.5
    /** @type {import('chart.js').ChartDataset<'line', number[]>[]} */
    const datasets = [
      {
        label: 'Завершено',
        data: series.completed,
        borderColor: ACCENT,
        backgroundColor: ACCENT_SOFT,
        pointBackgroundColor: ACCENT,
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1.5,
        pointRadius: pointR,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        order: 1,
      },
    ]

    if (series.avgCompleted != null) {
      datasets.push({
        label: 'Средняя',
        data: series.completed.map(() => series.avgCompleted),
        borderColor: AVG,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 1.5,
        borderDash: [6, 5],
        tension: 0,
        fill: false,
        order: 0,
      })
    }

    if (series.hasPrevMonth && Array.isArray(series.prevCompleted)) {
      datasets.push({
        label: 'Прошлый месяц',
        data: series.prevCompleted,
        borderColor: 'rgba(148, 163, 184, 0.85)',
        backgroundColor: 'transparent',
        pointBackgroundColor: 'rgba(148, 163, 184, 0.85)',
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1,
        pointRadius: series.pointCount > 40 ? 0 : 2,
        pointHoverRadius: 4,
        borderWidth: 1.75,
        borderDash: [5, 4],
        tension: 0.3,
        fill: false,
        spanGaps: false,
        order: 3,
      })
    }

    if (series.hasDraft) {
      datasets.push({
        label: 'Черновики',
        data: series.draft,
        borderColor: MUTED,
        backgroundColor: MUTED_SOFT,
        pointBackgroundColor: MUTED,
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1,
        pointRadius: series.pointCount > 40 ? 0 : 2,
        pointHoverRadius: 4,
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
        order: 2,
      })
    }
    return { labels: series.labels, datasets }
  }, [series])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        [ADMIN_CLUB_DAY_BANDS_PLUGIN_ID]: { flags: series.dayFlags },
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: TICK,
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            font: { size: 11, weight: '500' },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(10, 14, 12, 0.96)',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: 'rgba(226,232,240,0.88)',
          padding: 10,
          displayColors: true,
          callbacks: {
            title(items) {
              const idx = items?.[0]?.dataIndex
              if (idx == null) return ''
              const flag = series.dayFlags[idx]
              const base = formatDateRu(series.dates[idx]) || series.labels[idx] || ''
              if (flag?.today) return `${base} · сегодня`
              if (flag?.weekend) return `${base} · вых.`
              return base
            },
            label(ctx) {
              const v = ctx.parsed?.y
              if (v == null) return `${ctx.dataset.label}: —`
              if (ctx.dataset.label === 'Средняя') {
                return `Средняя: ${Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`
              }
              return `${ctx.dataset.label}: ${v}`
            },
            footer(items) {
              const idx = items?.[0]?.dataIndex
              if (idx == null) return ''
              /** @type {string[]} */
              const lines = []
              if (series.hasDraft) {
                const sum = (series.completed[idx] || 0) + (series.draft[idx] || 0)
                lines.push(`Всего: ${sum}`)
              }
              if (series.hasPrevMonth && Array.isArray(series.prevCompleted)) {
                const prev = series.prevCompleted[idx]
                const cur = series.completed[idx] || 0
                if (prev != null) {
                  const delta = cur - prev
                  lines.push(
                    delta === 0
                      ? 'Как в прошлом месяце'
                      : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} к прошлому месяцу`,
                  )
                }
              }
              return lines.join('\n')
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: series.pointCount > 20 ? 10 : 14,
            font: { size: 11 },
            color(ctx) {
              const flag = series.dayFlags[ctx.index]
              if (flag?.today) return ACCENT
              if (flag?.weekend) return TICK_WEEKEND
              return TICK
            },
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          ticks: {
            color: TICK,
            precision: 0,
            font: { size: 11 },
            padding: 6,
          },
          grid: {
            color: GRID,
            drawTicks: false,
          },
        },
      },
    }),
    [series],
  )

  if (!series.pointCount) {
    return (
      <p className="muted admin-club-day-chart__empty">
        Нет тренировок в выбранном диапазоне.
      </p>
    )
  }

  return (
    <div className="admin-club-day-chart" aria-label="График тренировок по дням">
      <div className="admin-club-day-chart__canvas">
        <Line key={`day-chart-${series.dates[0]}-${series.dates[series.dates.length - 1]}-${series.pointCount}`} data={chartBody} options={options} />
      </div>
      <p className="admin-club-day-chart__hint muted">
        Пунктир — средняя
        {series.avgCompleted != null
          ? ` (${Number(series.avgCompleted).toLocaleString('ru-RU', { maximumFractionDigits: 1 })})`
          : ''}
        {series.hasPrevMonth ? '; серая линия — тот же день прошлого месяца' : ''}
        . Светлее — выходные, золотая полоса — сегодня.
      </p>
    </div>
  )
}
