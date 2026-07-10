import { SalesFinanceForecast } from './SalesFinanceForecast.jsx'

/**
 * Прогноз для менеджера: план уровня 3 и направления (без финансов и ЗП).
 * @param {{
 *   year: number,
 *   month: number,
 *   monthRows: Array<Record<string, unknown>>,
 *   membershipTypes: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string>,
 * }} props
 */
export function SalesManagerAnalyticsPanel({ year, month, monthRows, membershipTypes, planForm = {} }) {
  return (
    <section className="sales-report__panel sales-report__analytics" aria-labelledby="sales-analytics-title">
      <h2 className="sr-only" id="sales-analytics-title">
        Аналитика
      </h2>
      <SalesFinanceForecast
        variant="plan"
        year={year}
        month={month}
        monthRows={monthRows}
        membershipTypes={membershipTypes}
        planForm={planForm}
      />
    </section>
  )
}
