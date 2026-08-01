import { useOutletContext, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminExcelListsMaps } from '../../components/admin/AdminExcelListsMaps.jsx'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'

/**
 * Админ: отдельные Excel-карты (ТЗ/АЗ закрытия, ПЗ без планшета).
 */
export function AdminExcelLists() {
  const outlet = useOutletContext() ?? {}
  const [search] = useSearchParams()
  const clubId = String(outlet.clubId || search.get('club') || '')

  return (
    <section className="admin-section-shell admin-section-shell--wide admin-excel-lists">
      <AdminSectionHeader
        icon={FileSpreadsheet}
        title="Excel-списки"
        lead="Карты для стратегии: закрытия ТЗ и АЗ (разово / по мере выгрузки) и позже — занятия ПЗ у тренеров без планшета. Дневные оплаты 31.xlsx остаются в отчёте продаж."
      />
      <AdminExcelListsMaps
        clubId={clubId}
        onClosingDone={() => dispatchLocalDataChanged({ reason: 'desk-closing-import' })}
      />
    </section>
  )
}
