import { AdminDeskClosingImportSection } from './AdminDeskClosingImportSection.jsx'

/**
 * Excel-карты админа: список заканчивающихся (ТЗ+АЗ).
 * Часы ПЗ — ежедневно в «Отчёт продаж», не здесь.
 * @param {{ clubId: string, onClosingDone?: () => void }} props
 */
export function AdminExcelListsMaps({ clubId, onClosingDone }) {
  if (!clubId) {
    return <p className="muted">Сначала выберите клуб в шапке страницы.</p>
  }

  return (
    <div className="admin-excel-lists-maps">
      <article className="admin-excel-map-card admin-excel-map-card--closings">
        <div className="admin-excel-map-card__head">
          <span className="admin-excel-map-card__badge">Сейчас</span>
          <h3 className="admin-section-title">Список заканчивающихся (ТЗ и АЗ)</h3>
        </div>
        <AdminDeskClosingImportSection
          clubId={clubId}
          defaultHall={null}
          onDone={onClosingDone}
          fileButtonLabel="Загрузить выгрузку из 1С"
        >
          <ol className="admin-excel-map-card__steps">
            <li>Возьмите из 1С файл закрытий — один на оба зала (ТЗ и АЗ вместе).</li>
            <li>Загрузите его сюда. Программа сама поставит зал по колонке «Тип карты».</li>
            <li>Проверьте таблицу ниже и нажмите «Применить» — тренер не нужен.</li>
            <li>
              Смотрите результат: <strong>Клиенты</strong> → вкладки <strong>ТЗ</strong> и{' '}
              <strong>АЗ</strong> (персональный зал — вкладка <strong>ПЗ</strong>).
            </li>
          </ol>
          <p className="muted admin-excel-map-card__note">
            Не сюда: дневные оплаты (<strong>31.xlsx</strong>) и часы ПЗ (<strong>otchet_pz.xlsx</strong>) — в
            «Отчёт продаж».
          </p>
        </AdminDeskClosingImportSection>
      </article>
    </div>
  )
}
