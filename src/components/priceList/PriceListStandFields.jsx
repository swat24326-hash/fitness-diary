/**
 * Шапка стенда + подвал (разовое / клубная карта) — поля как в Excel ПЗ.
 *
 * @param {{
 *   doc: object,
 *   onValidFrom: (value: string) => void,
 *   onMeta: (field: string, value: string) => void,
 *   onExtras: (patch: { club_card?: string, one_time_base?: string, one_time_day?: string }) => void,
 * }} props
 */
export function PriceListStandFields({ doc, onValidFrom, onMeta, onExtras }) {
  const extras = doc?.extras ?? {}
  const oneTime = extras.one_time ?? {}

  return (
    <div className="price-list__stand price-list__no-print" aria-label="Шапка и подвал стенда">
      <div className="price-list__stand-glow" aria-hidden />
      <p className="price-list__stand-label">Шапка (печать / PNG)</p>
      <div className="price-list__meta">
        <label className="price-list__field price-list__field--grow">
          <span className="price-list__label">Заголовок</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={doc.meta?.title ?? ''}
            onChange={(e) => onMeta('title', e.target.value)}
            placeholder="Персональный зал"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Цены с</span>
          <input
            type="date"
            className="input price-list__input-field"
            value={doc.valid_from ?? ''}
            onChange={(e) => onValidFrom(e.target.value)}
          />
        </label>
        <label className="price-list__field price-list__field--grow">
          <span className="price-list__label">Адрес на стенде</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={doc.meta?.address ?? ''}
            onChange={(e) => onMeta('address', e.target.value)}
            placeholder="Город, улица, ТЦ…"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Телефон</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={doc.meta?.phone ?? ''}
            onChange={(e) => onMeta('phone', e.target.value)}
            placeholder="8-…"
          />
        </label>
      </div>

      <p className="price-list__stand-label">Подвал (как в Excel)</p>
      <div className="price-list__meta">
        <label className="price-list__field">
          <span className="price-list__label">Разовое (база)</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={oneTime.base ?? ''}
            onChange={(e) => onExtras({ one_time_base: e.target.value })}
            placeholder="1300"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Разовое (день)</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={oneTime.day ?? ''}
            onChange={(e) => onExtras({ one_time_day: e.target.value })}
            placeholder="1100"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Клубная карта</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={extras.club_card ?? ''}
            onChange={(e) => onExtras({ club_card: e.target.value })}
            placeholder="500"
          />
        </label>
      </div>
    </div>
  )
}
