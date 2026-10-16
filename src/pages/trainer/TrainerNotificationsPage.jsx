import { Navigate } from 'react-router-dom'

/**
 * Совместимость: /trainer/notifications → главная с вкладкой «От клиентов» в панели Входящих.
 * Отдельного колокольчика в шапке больше нет — Планёрка и клиенты в одной кнопке.
 */
export function TrainerNotificationsPage() {
  return <Navigate to="/trainer?inbox=clients" replace />
}
