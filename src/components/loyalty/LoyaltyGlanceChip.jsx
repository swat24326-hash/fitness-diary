import { formatLoyaltyGlanceChip } from '../../lib/loyalty/loyaltyGlanceUiCore.js'
import '../../styles/loyalty.css'

/** Чип баллов в строке списка. Без снимка — ничего не рисуем (не выдумываем 0). */
export function LoyaltyGlanceChip({ snapshot }) {
  const chip = formatLoyaltyGlanceChip(snapshot)
  if (!chip.show) return null
  return (
    <div className={`td-client-fact loyalty-glance-chip loyalty-glance-chip--${chip.tone}`} title={chip.title}>
      <span className="td-client-fact__label">{chip.label}</span>
      <span className="td-client-fact__value">{chip.value}</span>
    </div>
  )
}
