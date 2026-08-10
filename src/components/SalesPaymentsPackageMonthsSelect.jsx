import { useEffect, useState } from 'react'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  formatDeskPackageMonthsLabel,
} from '../lib/admin/deskMembershipLedgerCore.js'
import {
  PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM,
  PAYMENT_LINK_PACKAGE_MONTHS_MAX,
  isPaymentLinkPackageMonthsPreset,
  parsePaymentLinkCustomPackageMonths,
  paymentLinkPackageMonthsSelectValue,
} from '../lib/admin/salesPaymentsLinkCore.js'

/**
 * Срок пакета: пресеты 1/2/3/6/12 + «Другое…» с полем произвольного числа месяцев.
 * Пока в «Другое» нет валидного числа — onChange(null), «Создать» неактивна.
 * Режим «Другое» снимается только выбором пресета в select (не при промежуточном «1» из «10»).
 */
export function SalesPaymentsPackageMonthsSelect({
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Срок пакета',
}) {
  const parsed = parsePaymentLinkCustomPackageMonths(value)
  const [forceCustom, setForceCustom] = useState(
    () => value == null || value === '' || !isPaymentLinkPackageMonthsPreset(value),
  )
  const [customDraft, setCustomDraft] = useState(() =>
    parsed != null && !isPaymentLinkPackageMonthsPreset(parsed) ? String(parsed) : '',
  )

  useEffect(() => {
    if (value == null || value === '') {
      setForceCustom(true)
      return
    }
    if (!isPaymentLinkPackageMonthsPreset(value)) {
      setForceCustom(true)
      const n = parsePaymentLinkCustomPackageMonths(value)
      if (n != null) setCustomDraft(String(n))
    }
  }, [value])

  const selectValue = paymentLinkPackageMonthsSelectValue(value, forceCustom)
  const showCustom = selectValue === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM

  return (
    <div className="sales-payments-link__months-wrap">
      <select
        className="select sales-payments-link__months"
        value={selectValue}
        disabled={disabled}
        aria-label={ariaLabel}
        title="Срок абонемента: дата окончания = дата отчёта + N календарных месяцев"
        onChange={(e) => {
          const next = e.target.value
          if (next === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM) {
            setForceCustom(true)
            const keep =
              parsed != null && !isPaymentLinkPackageMonthsPreset(parsed) ? parsed : null
            setCustomDraft(keep != null ? String(keep) : '')
            onChange(keep)
            return
          }
          setForceCustom(false)
          setCustomDraft('')
          onChange(Number(next))
        }}
      >
        {DESK_PACKAGE_MONTH_OPTIONS.map((n) => (
          <option key={n} value={String(n)}>
            {formatDeskPackageMonthsLabel(n)}
          </option>
        ))}
        <option value={PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM}>Другое…</option>
      </select>
      {showCustom ? (
        <input
          type="number"
          className="input sales-payments-link__months-custom"
          min={1}
          max={PAYMENT_LINK_PACKAGE_MONTHS_MAX}
          step={1}
          inputMode="numeric"
          disabled={disabled}
          value={customDraft}
          placeholder="мес."
          aria-label={`${ariaLabel}: своё число месяцев`}
          title={`Целое число от 1 до ${PAYMENT_LINK_PACKAGE_MONTHS_MAX}`}
          onChange={(e) => {
            const raw = e.target.value
            setCustomDraft(raw)
            onChange(parsePaymentLinkCustomPackageMonths(raw))
          }}
        />
      ) : null}
    </div>
  )
}
