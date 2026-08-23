import { useOutletContext, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminExcelListsMaps } from '../../components/admin/AdminExcelListsMaps.jsx'

/**
 * Админ: Excel закрытий (ТЗ+АЗ из одного файла).
 */
export function AdminExcelLists() {
  const outlet = useOutletContext() ?? {}
  const [search] = useSearchParams()
  const clubId = String(outlet.clubId || search.get('club') || '')

  return (
    <section className="admin-section-shell admin-section-shell--wide admin-excel-lists">
      <AdminSectionHeader
        icon={FileSpreadsheet}
        title="Списки из Excel"
        lead="Периодические закрытия ТЗ/АЗ из 1С. Дневные оплаты (31.xlsx) и часы ПЗ (otchet_pz.xlsx) — в «Отчёт продаж»."
      />
      <AdminExcelListsMaps clubId={clubId} />
    </section>
  )
}
