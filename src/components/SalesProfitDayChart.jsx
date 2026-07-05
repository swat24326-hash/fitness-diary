import { SalesProfitColumnChart } from './SalesProfitColumnChart.jsx'

/**
 * @param {{
 *   series: Array<{ date: string, profit: number | null, hasReport: boolean }>,
 *   maxProfit: number,
 *   onDayClick?: (iso: string) => void,
 * }} props
 */
export function SalesProfitDayChart({ series, onDayClick }) {
  return <SalesProfitColumnChart series={series} onDayClick={onDayClick} />
}
