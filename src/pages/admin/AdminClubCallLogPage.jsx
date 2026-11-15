import { useMemo } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { AdminClubOutreachJournalWorkspace } from '../../components/admin/AdminClubOutreachJournalWorkspace.jsx'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { useAuth } from '../../context/AuthContext'
import '../../styles/club-call.css'

/**
 * Отдельный экран журнала связи клуба (звонки + сводка + учёт SMS).
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

  const initialTab = String(searchParams.get('tab') ?? '').trim() || 'list'

  return (
    <div
      className={`admin-page club-call-log-page admin-section-shell admin-section-shell--wide${
        isSales ? ' sales-report sales-report--wide sales-report--manager' : ''
      }`}
    >
      <AdminSectionHeader icon={Phone} title="Журнал звонков" />
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
