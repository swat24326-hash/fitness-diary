import { useMemo, useRef } from 'react'
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
import {
  ATTENDANCE_MISSED_LABEL_RU,
  attendanceChartSignature,
  buildAttendanceChartAxisLabels,
  formatAttendanceBucketTablePeriodRu,
  formatGroupedVisitDatesRu,
} from '../lib/clientAttendanceStatsCore'
import { formatDateRu } from '../lib/dateRu'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

/** Как режим «Вес» — синие столбцы за визиты. */
const BAR_FILL = 'rgba(96, 165, 250, 0.72)'
const BAR_BORDER = 'rgb(96, 165, 250)'
/** Пропуск: приглушённый контур, чтобы «пустая неделя» была видна на оси. */
const BAR_FILL_MISSED = 'rgba(248, 113, 113, 0.1)'
const BAR_BORDER_MISSED = 'rgba(248, 113, 113, 0.38)'

/**
 * @param {{
 *   buckets: Array<{ index: number, labelRu: string, count: number, dates: string[], visited?: boolean }>,
 *   bucketKind: 'week' | 'month',
 * }} props
 */
export function ClientAttendanceChart({ buckets, bucketKind }) {
  const bucketsRef = useRef(buckets)
  bucketsRef.current = buckets
  // Новый объект data/options на каждый ре-рендер родителя = chart.update() и заново анимация столбиков.
  const signature = attendanceChartSignature(buckets, bucketKind)
  const chartData = useMemo(() => buildChartData(bucketsRef.current, bucketKind), [signature, bucketKind])
  const chartOptions = useMemo(() => buildChartOptions(bucketsRef, bucketKind), [signature, bucketKind])
  return <Bar data={chartData} options={chartOptions} />
}

function buildChartData(buckets, bucketKind) {
  const labels = buildAttendanceChartAxisLabels(buckets, bucketKind)
  const data = buckets.map((b) => b.count)
  const kindLabel = bucketKind === 'month' ? 'месяцам' : 'неделям'
  return {
    labels,
    datasets: [
      {
        label: `Тренировок по ${kindLabel}`,
        data,
        backgroundColor: data.map((n) => (n > 0 ? BAR_FILL : BAR_FILL_MISSED)),
        borderColor: data.map((n) => (n > 0 ? BAR_BORDER : BAR_BORDER_MISSED)),
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 44,
      },
    ],
  }
}

function buildChartOptions(bucketsRef, bucketKind) {
  const count = bucketsRef.current.length
  return {
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
          title(items) {
            const idx = items[0]?.dataIndex
            const b = idx == null ? null : bucketsRef.current[idx]
            return b ? formatAttendanceBucketTablePeriodRu(b, bucketKind) : ''
          },
          label(ctx) {
            const n = Number(ctx.parsed.y) || 0
            return n > 0 ? `Тренировок: ${n}` : ATTENDANCE_MISSED_LABEL_RU
          },
          afterBody(items) {
            const idx = items[0]?.dataIndex
            const b = idx == null ? null : bucketsRef.current[idx]
            return b?.dates?.length ? formatGroupedVisitDatesRu(b.dates, formatDateRu) : ''
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
          autoSkip: count > 14,
          maxTicksLimit: count > 14 ? 18 : count,
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
  }
}
