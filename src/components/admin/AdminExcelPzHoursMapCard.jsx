import { FileSpreadsheet } from 'lucide-react'

/**
 * Заглушка карты ПЗ: занятия тренеров без планшета (книга часов).
 * Парсер Kniga — отдельным шагом; здесь только место в UI.
 */
export function AdminExcelPzHoursMapCard() {
  return (
    <section className="admin-excel-map-card admin-excel-map-card--pz" aria-label="Карта ПЗ: занятия без планшета">
      <div className="admin-excel-map-card__head">
        <span className="admin-excel-map-card__badge">ПЗ</span>
        <h3 className="admin-section-title">Карта ПЗ: занятия без планшета</h3>
      </div>
      <p className="muted">
        Сюда позже — Excel вроде <strong>Kniga1.xlsx</strong> (тренер × тип карты × число занятий). Нужен для матрицы
        отчёта, когда у тренера нет планшета FIT-CITY. Сейчас загрузка ещё не включена.
      </p>
      <p className="muted admin-excel-map-card__note">
        Не путать с закрытиями ТЗ/АЗ и не с дневными оплатами 31.xlsx.
      </p>
      <label className="sales-payments-import__file sales-payments-import__file--disabled">
        <FileSpreadsheet size={18} aria-hidden />
        <span>Скоро: выбрать книгу часов</span>
        <input type="file" accept=".xlsx,.xls" disabled />
      </label>
    </section>
  )
}
