import { AdminClients } from './AdminClients.jsx'

/** Список клиентов клуба для менеджера продаж — те же фильтры, что у админа. */
export function SalesClients() {
  return <AdminClients accessMode="sales_manager" />
}
