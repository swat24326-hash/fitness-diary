import { useMemo } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Gift } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { LoyaltyJournalSection } from '../../components/loyalty/LoyaltyJournalSection.jsx'
import { buildAdminClientsListHref } from '../../lib/admin/adminClientsListHrefCore.js'
import { useAuth } from '../../context/AuthContext'

/**
 * Журнал списаний баллов: /admin/loyalty и /sales/loyalty.
 */
export function AdminLoyaltyJournal({ accessMode = 'admin' } = {}) {
  const [searchParams] = useSearchParams()
  const outlet = useOutletContext()
  const { user } = useAuth()
  const isSales = accessMode === 'sales_manager'

  const clubId = useMemo(() => {
    if (isSales) {
      return String(outlet?.clubId ?? '').trim() || String(user?.club_id ?? '').trim()
    }
    return String(searchParams.get('club') ?? '').trim() || String(outlet?.clubId ?? '').trim()
  }, [isSales, outlet?.clubId, searchParams, user?.club_id])

  const listBackHref = useMemo(
    () =>
      buildAdminClientsListHref(isSales ? '/sales/clients' : '/admin/clients', {
        clubId: isSales ? '' : clubId,
      }),
    [isSales, clubId],
  )

  return (
    <div className="admin-page">
      <AdminSectionHeader
        icon={Gift}
        title="Журнал баллов"
        lead="Списания куша ПЗ. Списать можно в карточке клиента, только при сети."
      />
      <LoyaltyJournalSection clubId={clubId} listBackHref={listBackHref} />
    </div>
  )
}
