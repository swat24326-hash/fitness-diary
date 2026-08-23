import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { formatGroupedVisitDatesRu } from '../lib/clientAttendanceStatsCore'
import { formatDateRu } from '../lib/dateRu'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

/** Как режим «Вес» в Statistics.jsx — один стиль для всех ролей. */
const BAR_FILL = 'rgba(96, 165, 250, 0.72)'
const BAR_BORDER = 'rgb(96, 165, 250)'
const BAR_FILL_ZERO = 'rgba(255, 255, 255, 0.06)'
const BAR_BORDER_ZERO = 'rgba(255, 255, 255, 0.12)'

/**
 * @param {{ buckets: Array<{ labelRu: string, count: number, dates: string[] }>, bucketKind: 'week' | 'month' }} props
 */
export function ClientAttendanceChart({ buckets, bucketKind }) {
  const labels = buckets.map((b) => b.labelRu)
  const data = buckets.map((b) => b.count)
  const kindLabel = bucketKind === 'month' ? 'месяцам' : 'неделям'

  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: `Тренировок по ${kindLabel}`,
            data,
            backgroundColor: data.map((n) => (n > 0 ? BAR_FILL : BAR_FILL_ZERO)),
            borderColor: data.map((n) => (n > 0 ? BAR_BORDER : BAR_BORDER_ZERO)),
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 6, left: 6, right: 10, bottom: 6 } },
        plugins: {
          legend: {
            position: 'top',
            align: 'center',
            labels: {
              color: '#d4d4d8',
              boxWidth: 14,
              boxHeight: 14,
              usePointStyle: true,
              pointStyle: 'rectRounded',
              padding: 16,
              font: { size: 12, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(10, 12, 11, 0.95)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            padding: 10,
            callbacks: {
              label(ctx) {
                const n = Number(ctx.parsed.y) || 0
                return `Тренировок: ${n}`
              },
              afterBody(items) {
                const idx = items[0]?.dataIndex
                if (idx == null || !buckets[idx]?.dates?.length) return ''
                return formatGroupedVisitDatesRu(buckets[idx].dates, formatDateRu)
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: 'rgba(229,231,235,0.72)',
              maxRotation: 45,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 18,
            },
            grid: { color: 'rgba(255,255,255,0.045)' },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: 'rgba(229,231,235,0.72)',
              stepSize: 1,
              precision: 0,
            },
            grid: { color: 'rgba(255,255,255,0.045)' },
          },
        },
      }}
    />
  )
}
