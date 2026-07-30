import { useMemo, useState } from 'react'
import { FileSpreadsheet, X } from 'lucide-react'
import { filterPriceListCatalogTypes } from '../../lib/priceList/priceListCore.js'
import {
  applyExcelImportToPriceListDocument,
  suggestExcelColumnMapping,
} from '../../lib/priceList/priceListExcelImportCore.js'
import { parsePriceListXlsxFile } from '../../lib/priceList/priceListExcelWorkbook.js'

/**
 * Мастер импорта Excel → прайс (сопоставление колонок с типами клуба).
 *
 * @param {{
 *   clubId: string,
 *   doc: object,
 *   membershipTypes?: object[],
 *   onApply: (nextDoc: object, meta: { applied: number, skippedUnmapped: number }) => void,
 *   onClose: () => void,
 * }} props
 */
export function PriceListExcelImportWizard({ clubId, doc, membershipTypes = [], onApply, onClose }) {
  const catalog = useMemo(() => filterPriceListCatalogTypes(membershipTypes), [membershipTypes])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [workbook, setWorkbook] = useState(null)
  const [mapping, setMapping] = useState(/** @type {Record<string, string>} */ ({}))
  const [fileName, setFileName] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    setWorkbook(null)
    try {
      const parsed = await parsePriceListXlsxFile(file)
      if (!parsed.ok) {
        setError('Не удалось разобрать файл: нет знакомых листов прайса')
        return
      }
      const suggested = suggestExcelColumnMapping(parsed.excelLabels, catalog)
      /** @type {Record<string, string>} */
      const nextMap = {}
      for (const label of parsed.excelLabels) {
        nextMap[label] = suggested[label] ? String(suggested[label]) : ''
      }
      setWorkbook(parsed)
      setMapping(nextMap)
      setFileName(file.name || 'price.xlsx')
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Ошибка чтения файла')
    } finally {
      setBusy(false)
    }
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length

  const handleApply = () => {
    if (!workbook) return
    /** @type {Record<string, string | null>} */
    const columnMapping = {}
    for (const [label, id] of Object.entries(mapping)) {
      columnMapping[label] = id ? String(id) : null
    }
    const result = applyExcelImportToPriceListDocument(
      { ...doc, club_id: clubId },
      workbook,
      columnMapping,
      catalog,
    )
    if (!result.applied) {
      setError('Ни одной ячейки не попало в прайс — сопоставьте хотя бы одну колонку с типом')
      return
    }
    onApply(result.doc, { applied: result.applied, skippedUnmapped: result.skippedUnmapped })
  }

  return (
    <div className="price-list-import" role="dialog" aria-label="Импорт прайса из Excel">
      <div className="price-list-import__head">
        <div>
          <p className="price-list__eyebrow">Импорт</p>
          <h3 className="price-list-import__title">Excel → типы клуба</h3>
          <p className="price-list-import__lead muted">
            Эталон — коды абонементов (PL, VIP…). Подписи из файла только помогают сопоставить колонки.
            Несопоставленные карты пропускаются.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm btn-icon-square" onClick={onClose} aria-label="Закрыть">
          <X size={16} aria-hidden />
        </button>
      </div>

      <label className="price-list-import__file">
        <FileSpreadsheet size={18} aria-hidden />
        <span>{fileName || 'Выбрать .xlsx'}</span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            void handleFile(f)
            e.target.value = ''
          }}
        />
      </label>

      {error ? <p className="price-list-import__error">{error}</p> : null}

      {workbook ? (
        <div className="price-list-import__body">
          <p className="muted price-list-import__stats">
            Листов: {workbook.sheets.filter((s) => s.ok).length} · колонок: {workbook.excelLabels.length} ·
            сопоставлено: {mappedCount}
          </p>
          <ul className="price-list-import__map">
            {workbook.excelLabels.map((label) => (
              <li key={label} className="price-list-import__row">
                <span className="price-list-import__excel" title={label}>
                  {label}
                </span>
                <select
                  className="input price-list-import__select"
                  value={mapping[label] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [label]: e.target.value }))}
                  aria-label={`Тип для ${label}`}
                >
                  <option value="">— пропустить —</option>
                  {catalog.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {!catalog.length ? (
            <p className="muted">Нет платных типов ПЗ у клуба — сначала заведите карты в абонементах.</p>
          ) : null}
          <div className="price-list-import__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !mappedCount}
              onClick={handleApply}
            >
              Подставить в прайс
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
