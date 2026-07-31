/**
 * Шапка / подвал стенда АЗ.
 *
 * @param {{
 *   doc: object,
 *   onValidFrom: (value: string) => void,
 *   onMeta: (patch: object) => void,
 *   onExtras: (patch: object) => void,
 * }} props
 */
export function AzPriceListStandFields({ doc, onValidFrom, onMeta, onExtras }) {
  const extras = doc?.extras ?? {}
  const address = (doc.meta?.address_lines ?? []).join('; ')
  const phone = (doc.meta?.phones ?? []).join('; ')

  return (
    <div className="price-list__stand" aria-label="Шапка и подвал стенда АЗ">
      <div className="price-list__stand-glow" aria-hidden />
      <p className="price-list__stand-label">Шапка (как в Excel)</p>
      <div className="price-list__meta">
        <label className="price-list__field price-list__field--grow">
          <span className="price-list__label">Заголовок</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={doc.meta?.title ?? ''}
            onChange={(e) => onMeta({ title: e.target.value })}
            placeholder="Зал групповых программ"
          />
        </label>
        <label className="price-list__field price-list__field--grow">
          <span className="price-list__label">Адрес на стенде</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={address}
            onChange={(e) =>
              onMeta({
                address_lines: e.target.value
                  .split(/;|\n/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Город; улица; ТЦ…"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Телефон</span>
          <input
            type="text"
            className="input price-list__input-field"
            value={phone}
            onChange={(e) =>
              onMeta({
                phones: e.target.value
                  .split(/;|,/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="8-…"
          />
        </label>
      </div>

      <p className="price-list__stand-label">Подвал стенда</p>
      <div className="price-list__meta">
        <label className="price-list__field">
          <span className="price-list__label">Результат+</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={extras.result_plus ?? ''}
            onChange={(e) => onExtras({ result_plus: e.target.value })}
            placeholder="730"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Разовое Результат+</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={extras.one_time_result_plus ?? ''}
            onChange={(e) => onExtras({ one_time_result_plus: e.target.value })}
            placeholder="750"
          />
        </label>
        <label className="price-list__field">
          <span className="price-list__label">Доплата ПТ вечером</span>
          <input
            type="number"
            inputMode="numeric"
            className="input price-list__input-field"
            min={0}
            step={1}
            value={extras.evening_pt_surcharge ?? ''}
            onChange={(e) => onExtras({ evening_pt_surcharge: e.target.value })}
            placeholder="100"
          />
        </label>
        <label className="price-list__field price-list__field--grow">
          <span className="price-list__label">Цены действительны с</span>
          <input
            type="date"
            className="input price-list__input-field"
            value={doc.valid_from ?? ''}
            onChange={(e) => onValidFrom(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
