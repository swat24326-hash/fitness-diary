import { useMemo } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { AdminClubOutreachJournalWorkspace } from '../../components/admin/AdminClubOutreachJournalWorkspace.jsx'
import { buildAdminClientsListHref } from '../../lib/admin/adminClientsListHrefCore.js'
import { useAuth } from '../../context/AuthContext'
import '../../styles/club-call.css'

/**
 * Отдельный экран журнала связи клуба (звонки + сводка + учёт SMS) — на всю высоту main.
 * Роли: admin / sales_manager / supervisor.
 * @param {{ accessMode?: 'admin' | 'sales_manager' | 'supervisor' }} [props]
 */
export function AdminClubCallLogPage({ accessMode = 'admin' } = {}) {
  const [searchParams] = useSearchParams()
  const outlet = useOutletContext()
  const { user, isSupervisor } = useAuth()
  const isSales = accessMode === 'sales_manager'
  const isSup = accessMode === 'supervisor' || isSupervisor

  const clubId = useMemo(() => {
    if (isSales || isSup) {
      return (
        String(outlet?.clubId ?? '').trim() ||
        String(user?.club_id ?? '').trim() ||
        String(searchParams.get('club') ?? '').trim()
      )
    }
    return String(searchParams.get('club') ?? '').trim() || String(outlet?.clubId ?? '').trim()
  }, [isSales, isSup, outlet?.clubId, searchParams, user?.club_id])

  const clientsBase = isSales ? '/sales/clients' : isSup ? '/club/clients' : '/admin/clients'
  const listBackHref = useMemo(
    () =>
      buildAdminClientsListHref(clientsBase, {
        clubId: isSales || isSup ? '' : clubId,
      }),
    [clientsBase, clubId, isSales, isSup],
  )
  const initialTab = String(searchParams.get('tab') ?? '').trim() || 'list'

  return (
    <div className="admin-page club-call-log-page">
      <div className="club-call-log-page__bar">
        <Link className="club-call-log-page__back" to={listBackHref}>
          ← К клиентам
        </Link>
      </div>
      {!clubId ? (
        <p className="muted club-call-log-page__empty" role="status">
          {isSales || isSup
            ? 'Клуб не привязан к учётке — журнал недоступен.'
            : 'Выберите клуб в шапке, чтобы открыть журнал звонков.'}
        </p>
      ) : (
        <AdminClubOutreachJournalWorkspace clubId={clubId} layout="page" initialTab={initialTab} />
      )}
    </div>
  )
}
