import { FileSpreadsheet } from 'lucide-react'

/**
 * Заглушка: книга часов ПЗ у тренеров без планшета.
 */
export function AdminExcelPzHoursMapCard() {
  return (
    <section
      className="admin-excel-map-card admin-excel-map-card--pz"
      aria-label="Часы персональных — позже"
    >
      <div className="admin-excel-map-card__head">
        <span className="admin-excel-map-card__badge">Позже</span>
        <h3 className="admin-section-title">Часы персональных (ПЗ)</h3>
      </div>
      <p className="muted">
        Сюда потом попадёт книга занятий тренеров <strong>без планшета</strong> (файл вроде Kniga).
        Сейчас загрузка выключена — ничего нажимать не нужно.
      </p>
      <p className="muted admin-excel-map-card__note">
        Не путать со списком заканчивающихся слева и не с дневными оплатами.
      </p>
      <label className="sales-payments-import__file sales-payments-import__file--disabled">
        <FileSpreadsheet size={18} aria-hidden />
        <span>Пока недоступно</span>
        <input type="file" accept=".xlsx,.xls" disabled />
      </label>
    </section>
  )
}
