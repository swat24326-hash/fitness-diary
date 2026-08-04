import { AdminClientsKeepAliveLayout } from '../../components/admin/AdminClientsKeepAliveLayout.jsx'

/** Список + keep-alive карточки для менеджера продаж. */
export function SalesClients() {
  return <AdminClientsKeepAliveLayout accessMode="sales_manager" />
}
