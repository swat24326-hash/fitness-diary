import { useOutletContext, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminExcelListsMaps } from '../../components/admin/AdminExcelListsMaps.jsx'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'

/**
 * Админ: Excel закрытий (ТЗ+АЗ из одного файла) и карта ПЗ без планшета.
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
        lead="Здесь загружают периодические списки из 1С. Слева — кто заканчивается (ТЗ и АЗ в одном файле). Справа — часы ПЗ, пока недоступно. Дневные оплаты (31.xlsx) — не сюда, а в «Отчёт продаж»."
      />
      <AdminExcelListsMaps
        clubId={clubId}
        onClosingDone={() => dispatchLocalDataChanged({ reason: 'desk-closing-import' })}
      />
    </section>
  )
}
