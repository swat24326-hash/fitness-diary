/**
 * Поле «Цена / оплата пакета» на абоне (мост до домена payment).
 */
export function AdminMembershipPaidAmountField({
  value,
  onChange,
  id = 'membership-paid-amount',
  disabled = false,
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="label" htmlFor={id}>
        Цена / оплата пакета (₽)
      </label>
      <input
        id={id}
        className="input"
        type="text"
        inputMode="decimal"
        placeholder="например 8800"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="muted" style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.35 }}>
        Цена покупки на абонементе (для админа и менеджера). День клуба — в отчёте продаж; полный журнал
        платежей — позже.
      </p>
    </div>
  )
}
