import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { ClientInviteModal } from './ClientInviteModal.jsx'

/** Иконка в шапке карточки клиента: QR / ссылка на приложение клиента. Права проверяет сервер. */
export function ClientAppInviteButton({ client, disabled = false }) {
  const [open, setOpen] = useState(false)
  if (!client?.id) return null
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square"
        aria-label="Пригласить в приложение клиента"
        title={disabled ? 'Клиент в архиве' : 'Пригласить в приложение клиента'}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Smartphone size={16} aria-hidden />
      </button>
      <ClientInviteModal open={open} client={client} onClose={() => setOpen(false)} />
    </>
  )
}
