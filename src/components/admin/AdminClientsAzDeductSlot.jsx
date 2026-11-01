import { TicketMinus } from 'lucide-react'
import { AdminDeskAzDeductButton } from './AdminDeskAzDeductButton.jsx'

/**
 * Слот «списать занятие» в строке списка АЗ: всегда той же ширины,
 * чтобы «⋯» не прыгал, когда абона нет.
 *
 * @param {{
 *   membership?: object | null,
 *   membershipOptions?: object[] | null,
 *   azTypes?: Array<{ id?: string, name?: string, code?: string }>,
 *   clientName?: string,
 *   onDone?: () => void,
 *   onToast?: (msg: string) => void,
 * }} props
 */
export function AdminClientsAzDeductSlot({
  membership = null,
  membershipOptions = null,
  azTypes = [],
  clientName = '',
  onDone,
  onToast,
}) {
  if (membership?.id) {
    return (
      <AdminDeskAzDeductButton
        membership={membership}
        membershipOptions={membershipOptions}
        azTypes={azTypes}
        clientName={clientName}
        compact
        onDone={onDone}
        onToast={onToast}
      />
    )
  }

  const reason = 'Нет абонемента — сначала добавьте абон АЗ'
  return (
    <button
      type="button"
      className="btn btn-secondary btn-icon-square btn-touch is-muted"
      aria-disabled="true"
      title={reason}
      aria-label={`Списать нельзя: ${reason}`}
      onClick={() => onToast?.(reason)}
    >
      <TicketMinus size={20} aria-hidden />
    </button>
  )
}
