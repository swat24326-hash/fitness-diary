import { Smartphone } from 'lucide-react'

/** «В приложение» рядом с «В Max»: задание / рацион уходит клиенту в приложение клуба (useClientPlanSend). */
export function ClientPlanAppButton({ app, disabled = false, onClick }) {
  if (!app?.canSend) return null
  return (
    <button
      type="button"
      className="btn btn-touch btn-ghost homework-preview__send-other"
      disabled={disabled || app.busy}
      onClick={() => void onClick?.()}
      title="Клиент увидит на главной своего приложения и получит уведомление"
    >
      <Smartphone size={18} aria-hidden />
      {app.busy ? 'Отправляем…' : 'В приложение'}
    </button>
  )
}

/** Подпись под кнопками: «Отправлено 10.10, 18:40» / «Клиент открыл …» / ошибка. */
export function ClientPlanAppStatus({ app }) {
  if (!app?.canSend || !app.status) return null
  return (
    <p className={`client-plan-app-status${app.isError ? ' client-plan-app-status--error' : ''}`} role="status">
      {app.status}
    </p>
  )
}
