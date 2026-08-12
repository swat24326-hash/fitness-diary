/**
 * Чекбокс выбора клиента в режиме массовых SMS.
 *
 * @param {{
 *   clientId: string,
 *   clientName?: string,
 *   checked: boolean,
 *   disabled?: boolean,
 *   noPhone?: boolean,
 *   onChange: (clientId: string, checked: boolean) => void,
 * }} props
 */
export function AdminClubSmsCampaignRowCheck({
  clientId,
  clientName = '',
  checked,
  disabled = false,
  noPhone = false,
  onChange,
}) {
  const id = String(clientId ?? '').trim()
  if (!id) return null
  const label = noPhone
    ? `Нет телефона: ${clientName || id}`
    : `Выбрать для SMS: ${clientName || id}`

  return (
    <label
      className={`club-sms-campaign-check${noPhone ? ' club-sms-campaign-check--disabled' : ''}`}
      title={noPhone ? 'Нет номера для SMS' : undefined}
    >
      <input
        type="checkbox"
        className="club-sms-campaign-check__input"
        checked={checked && !noPhone}
        disabled={disabled || noPhone}
        aria-label={label}
        onChange={(e) => onChange?.(id, e.target.checked)}
      />
    </label>
  )
}
