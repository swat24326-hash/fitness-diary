import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ListFilter } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminClientListsPanel } from '../../components/admin/AdminClientListsPanel.jsx'
import { adminClientsListPathForLists } from '../../lib/admin/clientListsPathsCore.js'
import { useAdminClientListsData } from './useAdminClientListsData.js'
import '../../styles/admin-client-lists.css'
import '../../styles/sales-clients.css'

/**
 * @param {{ accessMode?: 'admin' | 'sales_manager' | 'supervisor' }} [props]
 */
export function AdminClientListsPage({ accessMode = 'admin' } = {}) {
  const clubBound = accessMode === 'sales_manager' || accessMode === 'supervisor'
  const { user } = useAuth()
  const outlet = useOutletContext() ?? {}
  const [search] = useSearchParams()
  const clubId = clubBound
    ? String(user?.club_id ?? '').trim()
    : String(outlet.clubId || search.get('club') || '').trim()

  const clientsBasePath = adminClientsListPathForLists(accessMode)
  const backHref =
    accessMode === 'sales_manager'
      ? '/sales/clients'
      : accessMode === 'supervisor'
        ? '/club/clients'
        : `/admin/clients${clubId ? `?club=${encodeURIComponent(clubId)}` : ''}`

  const data = useAdminClientListsData(clubId)
  const isSalesManager = accessMode === 'sales_manager'

  const backBtn = (
    <Link
      to={backHref}
      className="btn btn-ghost btn-sm btn-icon-square btn-touch"
      title="К клиентам"
      aria-label="К списку клиентов"
    >
      <ArrowLeft size={16} aria-hidden />
    </Link>
  )

  return (
    <section
      className={
        isSalesManager
          ? 'sales-clients sales-report sales-report--wide sales-report--manager'
          : 'admin-section-shell admin-section-shell--wide'
      }
    >
      {isSalesManager ? (
        <header className="sales-clients__topbar">
          <div className="sales-clients__topbar-text">
            <p className="sales-home__eyebrow">Клуб · день</p>
            <h1 className="sales-page__title">Списки</h1>
            <p className="sales-clients__lead">
              Собрать список по залу и признаку — без выгрузки из 1С.
            </p>
          </div>
          <div className="sales-clients__actions">{backBtn}</div>
        </header>
      ) : (
        <AdminSectionHeader
          icon={ListFilter}
          title="Списки клиентов"
          lead="Залы, живые или архив, дни рождения и сроки абонемента. Без Excel — на экране."
        >
          {backBtn}
        </AdminSectionHeader>
      )}

      {!clubId ? (
        <p className="admin-client-lists__empty" role="status">
          Выберите клуб — без club_id список недоступен.
        </p>
      ) : (
        <AdminClientListsPanel
          clients={data.clients}
          memByClient={data.memByClient}
          lifecycleRows={data.lifecycleRows}
          today={data.today}
          clientsBasePath={clientsBasePath}
          clubId={clubId}
          busy={data.busy}
          ready={data.ready}
          error={data.error}
          onRefresh={() => void data.refreshFromCloud()}
        />
      )}

      {accessMode === 'admin' ? (
        <p className="admin-client-lists__note">
          Массовый сид ТЗ/АЗ из файла 1С — в{' '}
          <Link to="/admin/excel-lists">Списки из Excel</Link>. Здесь — конструктор из данных Ядра.
        </p>
      ) : null}
    </section>
  )
}
