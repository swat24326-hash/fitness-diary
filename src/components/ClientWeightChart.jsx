import { useMemo } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { buildWeightChartSeries } from '../lib/healthCardCore.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

/**
 * @param {{ entries: object[], height?: number }} props
 */
export function ClientWeightChart({ entries, height = 200 }) {
  const series = useMemo(() => buildWeightChartSeries(entries), [entries])

  const chartBody = useMemo(
    () => ({
      labels: series.labels,
      datasets: [
        {
          label: 'Вес, кг',
          data: series.values,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.15)',
          pointBackgroundColor: '#34d399',
          pointBorderColor: '#0f172a',
          tension: 0.25,
          fill: true,
        },
      ],
    }),
    [series],
  )

  if (series.labels.length < 2) {
    return (
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
        Для графика нужно минимум две записи веса.
      </p>
    )
  }

  return (
    <div className="client-weight-chart" style={{ height }} aria-label="График веса">
      <Line
        data={chartBody}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10, 12, 11, 0.95)',
              borderColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              ticks: { color: 'rgba(229,231,235,0.72)', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
              grid: { color: 'rgba(255,255,255,0.045)' },
            },
            y: {
              ticks: { color: 'rgba(229,231,235,0.72)' },
              grid: { color: 'rgba(255,255,255,0.045)' },
            },
          },
        }}
      />
    </div>
  )
}
