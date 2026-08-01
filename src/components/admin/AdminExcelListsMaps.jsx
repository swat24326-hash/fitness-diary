import { AdminDeskClosingImportSection } from './AdminDeskClosingImportSection.jsx'
import { AdminExcelPzHoursMapCard } from './AdminExcelPzHoursMapCard.jsx'

/**
 * Три карты Excel для админа: ТЗ / АЗ закрытия + ПЗ без планшета.
 * @param {{ clubId: string, onClosingDone?: () => void }} props
 */
export function AdminExcelListsMaps({ clubId, onClosingDone }) {
  if (!clubId) {
    return <p className="muted">Выберите клуб в шапке — без клуба списки некуда писать.</p>
  }

  return (
    <div className="admin-excel-lists-maps">
      <article className="admin-excel-map-card admin-excel-map-card--tz">
        <div className="admin-excel-map-card__head">
          <span className="admin-excel-map-card__badge">ТЗ</span>
        </div>
        <AdminDeskClosingImportSection
          clubId={clubId}
          defaultHall="tz"
          onDone={onClosingDone}
          title="Карта ТЗ: закрытия договоров"
          hint="Разовый / периодический список закрытий тренажёрного зала. Карта + ФИО + дата окончания (+ цена). Без колонки «зал» — весь файл = ТЗ. На карточке — учёт абонов."
        />
      </article>

      <article className="admin-excel-map-card admin-excel-map-card--az">
        <div className="admin-excel-map-card__head">
          <span className="admin-excel-map-card__badge">АЗ</span>
        </div>
        <AdminDeskClosingImportSection
          clubId={clubId}
          defaultHall="az"
          onDone={onClosingDone}
          title="Карта АЗ: закрытия договоров"
          hint="То же для аэробного зала (+ цена в Excel по желанию). Не оплаты и не книга часов ПЗ."
        />
      </article>

      <AdminExcelPzHoursMapCard />
    </div>
  )
}
