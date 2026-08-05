import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminDeletionLogSection } from '../../components/admin/AdminDeletionLogSection.jsx'
import { buildAdminClientsListHref } from '../../lib/admin/adminClientsListHrefCore.js'

/**
 * Админ / менеджер: журнал жёстких удалений клиентов.
 */
export function AdminDeletionLogPage({ accessMode = 'admin' } = {}) {
  const [searchParams] = useSearchParams()
  const clubId = String(searchParams.get('club') ?? '').trim()
  const isSales = accessMode === 'sales_manager'
  const listBackHref = useMemo(
    () =>
      buildAdminClientsListHref(isSales ? '/sales/clients' : '/admin/clients', {
        clubId: isSales ? '' : clubId,
        clientsTab: 'archive',
      }),
    [isSales, clubId],
  )

  return (
    <div className="admin-page">
      <AdminSectionHeader
        title="Журнал удалений"
        lead="Кто удалил карточку клиента и когда. Архив сюда не пишется."
      />
      <AdminDeletionLogSection clubId={clubId} listBackHref={listBackHref} />
    </div>
  )
}
