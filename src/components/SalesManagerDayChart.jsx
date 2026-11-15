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
import { buildSalesManagerDayChartSeries } from '../lib/admin/salesManagerDayChartCore.js'
import { formatDateRu, todayInTimeZoneIso } from '../lib/dateRu'
import '../styles/admin-club-day-chart.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)
for (const id of ['adminClubDayBands', ADMIN_CLUB_DAY_BANDS_PLUGIN_ID]) {
  const prev = ChartJS.registry.plugins.get(id)
  if (prev) ChartJS.unregister(prev)
}
ChartJS.register(adminClubDayBandsPlugin)

const TRAININGS = '#5eead4'
const TRAININGS_SOFT = 'rgba(94, 234, 212, 0.14)'
const PNK = '#d4b45a'
const PNK_SOFT = 'rgba(212, 180, 90, 0.12)'
const AVG = 'rgba(226, 232, 240, 0.5)'
const TICK = 'rgba(226, 232, 240, 0.62)'
const TICK_WEEKEND = 'rgba(226, 232, 240, 0.38)'
const GRID = 'rgba(255, 255, 255, 0.05)'

/**
 * График ПНК + тренировок по дням (как у админа), клик по дню с отчётом.
 * @param {{
 *   pnkSeries: Array<{ date: string, value: number | null, hasReport: boolean }>,
 *   trainingsSeries: Array<{ date: string, value: number | null, hasReport: boolean }>,
 *   prevPnkSeries?: Array<{ date: string, value: number | null, hasReport: boolean }>|null,
 *   prevTrainingsSeries?: Array<{ date: string, value: number | null, hasReport: boolean }>|null,
 *   onDayClick?: (iso: string) => void,
 * }} props
 */
export function SalesManagerDayChart({
  pnkSeries,
  trainingsSeries,
  prevPnkSeries = null,
  prevTrainingsSeries = null,
  onDayClick,
}) {
  const todayIso = todayInTimeZoneIso()
  const series = useMemo(
    () =>
      buildSalesManagerDayChartSeries(pnkSeries, trainingsSeries, {
        todayIso,
        prevPnkSeries,
        prevTrainingsSeries,
      }),
    [pnkSeries, trainingsSeries, prevPnkSeries, prevTrainingsSeries, todayIso],
  )

  const chartBody = useMemo(() => {
    const pointR = series.pointCount > 40 ? 0 : series.pointCount > 20 ? 2.5 : 3.5
    /** @type {import('chart.js').ChartDataset<'line', Array<number|null>>[]} */
    const datasets = [
      {
        label: 'Тренировки',
        data: series.trainings,
        borderColor: TRAININGS,
        backgroundColor: TRAININGS_SOFT,
        pointBackgroundColor: TRAININGS,
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1.5,
        pointRadius: pointR,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        spanGaps: false,
        order: 1,
      },
      {
        label: 'ПНК',
        data: series.pnk,
        borderColor: PNK,
        backgroundColor: PNK_SOFT,
        pointBackgroundColor: PNK,
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1,
        pointRadius: series.pointCount > 40 ? 0 : 2.5,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        spanGaps: false,
        order: 2,
      },
    ]

    if (series.avgTrainings != null) {
      datasets.push({
        label: 'Средняя тренировок',
        data: series.trainings.map(() => series.avgTrainings),
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

    if (series.hasPrevMonth && Array.isArray(series.prevTrainings)) {
      datasets.push({
        label: 'Тренировки · прошлый',
        data: series.prevTrainings,
        borderColor: 'rgba(148, 163, 184, 0.9)',
        backgroundColor: 'transparent',
        pointBackgroundColor: 'rgba(148, 163, 184, 0.9)',
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

    if (series.hasPrevMonth && Array.isArray(series.prevPnk)) {
      datasets.push({
        label: 'ПНК · прошлый',
        data: series.prevPnk,
        borderColor: 'rgba(212, 180, 90, 0.45)',
        backgroundColor: 'transparent',
        pointBackgroundColor: 'rgba(212, 180, 90, 0.45)',
        pointBorderColor: 'rgba(15, 23, 20, 0.9)',
        pointBorderWidth: 1,
        pointRadius: series.pointCount > 40 ? 0 : 1.5,
        pointHoverRadius: 3,
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
        spanGaps: false,
        order: 4,
      })
    }

    return { labels: series.labels, datasets }
  }, [series])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onClick(_evt, elements) {
        if (!onDayClick || !elements?.length) return
        const idx = elements[0]?.index
        if (idx == null || !series.hasReport[idx]) return
        const iso = series.dates[idx]
        if (iso) onDayClick(iso)
      },
      onHover(evt, elements) {
        const canvas = evt?.native?.target
        if (!canvas?.style) return
        const idx = elements?.[0]?.index
        canvas.style.cursor = idx != null && series.hasReport[idx] && onDayClick ? 'pointer' : 'default'
      },
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
              if (!series.hasReport[idx]) return `${base} · нет отчёта`
              if (flag?.today) return `${base} · сегодня`
              if (flag?.weekend) return `${base} · вых.`
              return base
            },
            label(ctx) {
              const v = ctx.parsed?.y
              if (v == null) return `${ctx.dataset.label}: —`
              if (ctx.dataset.label === 'Средняя тренировок') {
                return `Средняя тренировок: ${Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`
              }
              return `${ctx.dataset.label}: ${v}`
            },
            footer(items) {
              const idx = items?.[0]?.dataIndex
              if (idx == null) return ''
              /** @type {string[]} */
              const lines = []
              if (!series.hasReport[idx]) {
                lines.push('Нет отчёта за этот день')
              } else {
                const t = series.trainings[idx] ?? 0
                const p = series.pnk[idx] ?? 0
                lines.push(`Клик — отчёт · ПНК ${p} / тренировок ${t}`)
                const prevT = series.prevTrainings?.[idx]
                if (prevT != null) {
                  const delta = t - prevT
                  lines.push(
                    delta === 0
                      ? 'Тренировки как в прошлом месяце'
                      : `Тренировки ${delta > 0 ? '+' : '−'}${Math.abs(delta)} к прошлому месяцу`,
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
              if (flag?.today) return TRAININGS
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
    [series, onDayClick],
  )

  if (!series.pointCount) {
    return (
      <p className="muted admin-club-day-chart__empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  return (
    <div className="admin-club-day-chart" aria-label="ПНК и тренировки по дням">
      <div className="admin-club-day-chart__canvas">
        <Line
          key={`sales-day-${series.dates[0]}-${series.dates[series.dates.length - 1]}-${series.pointCount}`}
          data={chartBody}
          options={options}
        />
      </div>
    </div>
  )
}
