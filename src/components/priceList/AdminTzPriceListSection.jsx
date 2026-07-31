import { useCallback, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, ImageDown, Printer, RefreshCw, Save } from 'lucide-react'
import {
  emptyTzPriceListDocument,
  formatTzMonthsLabel,
  formatTzSessionsLabel,
  normalizeTzPriceListDocument,
  recomputeTzPriceListDerived,
} from '../../lib/priceList/tzPriceListCore.js'
import { fetchTzPriceListForClub, saveTzPriceListForClub } from '../../lib/priceList/tzPriceListCloudService.js'
import { readTzPriceListLocalEntry } from '../../lib/priceList/tzPriceListLocalStorage.js'
import { importTzPriceListFromExcelBuffer } from '../../lib/priceList/tzPriceListExcelWorkbook.js'
import { formatPriceListMoney } from '../../lib/priceList/priceListExportCore.js'
import {
  downloadTzPriceListPng,
  printTzPriceListDocument,
} from '../../lib/priceList/tzPriceListExportCanvas.js'
import { buildTzPriceListPrintSheets } from '../../lib/priceList/tzPriceListPrintChrome.js'
import { TzPriceListStandFields } from './TzPriceListStandFields.jsx'
import '../../styles/price-list.css'
import '../../styles/tz-price-list.css'

/**
 * Прайс ТЗ в стиле витрины ПЗ (шапка стенда, матрица, легенда).
 *
 * @param {{ clubId: string }} props
 */
export function AdminTzPriceListSection({ clubId }) {
  const [doc, setDoc] = useState(() =>
    clubId ? readTzPriceListLocalEntry(clubId).doc : emptyTzPriceListDocument({ club_id: clubId }),
  )
  const [view, setView] = useState(/** @type {'month1' | 'promo'} */ ('month1'))
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef(/** @type {HTMLInputElement | null} */ (null))

  const applyFetch = useCallback((result) => {
    setDoc(result.doc)
    setDirty(false)
    if (!result.ok && result.error) setToast(result.error)
    else if (result.source === 'local' && result.error) {
      setToast(`Облако недоступно — локальный кэш. ${result.error}`)
    } else setToast('')
  }, [])

  const reload = useCallback(
    async (opts = {}) => {
      if (!clubId) {
        setDoc(emptyTzPriceListDocument())
        setDirty(false)
        return
      }
      const force = Boolean(opts.force)
      const entry = readTzPriceListLocalEntry(clubId)
      if (entry.doc && (entry.doc.updated_at || entry.doc.month1_rows?.length || entry.doc.promo_rows?.length)) {
        setDoc(entry.doc)
        if (!force) setDirty(false)
      }
      if (!force && entry.fresh) return
      setBusy(true)
      const result = await fetchTzPriceListForClub(clubId, { force })
      setBusy(false)
      applyFetch(result)
    },
    [applyFetch, clubId],
  )

  useEffect(() => {
    void reload()
  }, [clubId, reload])

  const patchDoc = (updater) => {
    setDoc((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return recomputeTzPriceListDerived(normalizeTzPriceListDocument(next, clubId))
    })
    setDirty(true)
  }

  const save = async () => {
    if (!clubId || busy) return
    setBusy(true)
    const result = await saveTzPriceListForClub(clubId, doc)
    setBusy(false)
    if (!result.ok) {
      setToast(result.error || 'Не удалось сохранить')
      return
    }
    setDoc(result.doc)
    setDirty(false)
    setToast('Прайс ТЗ сохранён в облаке для этого клуба')
  }

  const onExcel = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const res = importTzPriceListFromExcelBuffer(buf, { clubId })
      if (!res.ok) {
        setToast(res.error || 'Импорт не удался')
        return
      }
      setDoc(res.doc)
      setDirty(true)
      setToast(
        `Импорт: ${res.stats.month1} строк «1 мес», ${res.stats.promo} акций. Сохраните в облако.`,
      )
    } catch (e) {
      setToast(e?.message || 'Ошибка чтения Excel')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setMonth1Field = (id, field, value) => {
    patchDoc((prev) => ({
      ...prev,
      month1_rows: (prev.month1_rows ?? []).map((r) =>
        r.id === id ? { ...r, [field]: value, base_save: undefined, day_save: undefined } : r,
      ),
    }))
  }

  const setPromoField = (id, field, value) => {
    patchDoc((prev) => ({
      ...prev,
      promo_rows: (prev.promo_rows ?? []).map((r) =>
        r.id === id ? { ...r, [field]: value, save: undefined, month_cost: undefined } : r,
      ),
    }))
  }

  const handlePrint = () => {
    const result = printTzPriceListDocument(doc)
    if (!result.ok) setToast(result.error || 'Печать недоступна')
    else setToast('Если в диалоге стоит «Книжная» — переключите на «Альбомная»')
  }

  const handlePng = async () => {
    if (!buildTzPriceListPrintSheets(doc).length) {
      setToast('Сначала загрузите Excel / заполните сетку')
      return
    }
    setBusy(true)
    try {
      const result = await downloadTzPriceListPng(doc)
      if (!result.ok) setToast('Не удалось сделать PNG')
      else if (result.count > 1) setToast(`PNG: ${result.count} листа (1 месяц / Акции)`)
      else setToast(`PNG сохранён: ${result.filename}`)
    } catch (e) {
      setToast(e?.message ? String(e.message) : 'Ошибка PNG')
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <section className="card price-list" aria-label="Прайс ТЗ">
        <p className="muted">Выберите клуб в шапке — у каждого клуба свой прайс.</p>
      </section>
    )
  }

  const hasMonth1 = (doc.month1_rows ?? []).length > 0
  const hasPromo = (doc.promo_rows ?? []).length > 0
  const empty = !hasMonth1 && !hasPromo

  return (
    <section className="card price-list tz-price-list os-enter" aria-label="Прайс тренажёрного зала">
      <header className="price-list__head">
        <div className="price-list__head-text">
          <p className="price-list__eyebrow">Витрина клуба</p>
          <h2 className="price-list__title">Прайс · тренажёрный зал</h2>
          <p className="price-list__lead">
            Как на стенде: пакеты на 1 месяц (база / день) и акции на несколько месяцев. Импорт из
            Excel клуба — затем правка и сохранение в облако.
          </p>
        </div>
        <div className="price-list__actions">
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => void onExcel(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePrint}
            disabled={empty}
            title="Печать витрины (все заполненные листы)"
          >
            <Printer size={16} aria-hidden />
            Печать
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handlePng()}
            disabled={busy || empty}
            title="Скачать PNG всех заполненных листов"
          >
            <ImageDown size={16} aria-hidden />
            PNG
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !clubId}
            onClick={() => fileRef.current?.click()}
            title="Загрузить прайс ТЗ из Excel"
          >
            <FileSpreadsheet size={16} aria-hidden />
            Excel
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-square"
            disabled={busy || !clubId}
            onClick={() => void reload({ force: true })}
            aria-label="Обновить из облака"
            title="Обновить из облака"
          >
            <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !clubId || !dirty}
            onClick={() => void save()}
            aria-busy={busy}
          >
            <Save size={16} aria-hidden />
            Сохранить
          </button>
        </div>
      </header>

      {toast ? (
        <p className={`sync-feedback sync-feedback--${/ошиб|не удалось|неудал/i.test(toast) ? 'err' : 'ok'}`} role="status">
          {toast}
        </p>
      ) : null}

      <TzPriceListStandFields
        doc={doc}
        onValidFrom={(value) => patchDoc({ ...doc, valid_from: value || null })}
        onMeta={(field, value) =>
          patchDoc({ ...doc, meta: { ...doc.meta, [field]: value } })
        }
        onExtras={(patch) =>
          patchDoc({
            ...doc,
            extras: {
              ...doc.extras,
              ...(patch.one_time !== undefined ? { one_time: patch.one_time } : {}),
              ...(patch.club_card !== undefined ? { club_card: patch.club_card } : {}),
            },
          })
        }
      />

      <div className="price-list__toolbar">
        <div className="price-list__mode" role="tablist" aria-label="Лист прайса ТЗ">
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${view === 'month1' ? ' is-active' : ''}`}
            aria-selected={view === 'month1'}
            onClick={() => setView('month1')}
          >
            1 месяц
          </button>
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${view === 'promo' ? ' is-active' : ''}`}
            aria-selected={view === 'promo'}
            onClick={() => setView('promo')}
          >
            Акции
          </button>
        </div>

        {view === 'month1' ? (
          <ul className="price-list__legend" aria-label="Легенда цен">
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--full" />
              База полная
            </li>
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--off" />
              Стенд (скидка)
            </li>
            <li>
              <span className="price-list__legend-swatch tz-price-list__legend-day" />
              Дневная
            </li>
          </ul>
        ) : (
          <ul className="price-list__legend" aria-label="Легенда акций">
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--full" />
              База
            </li>
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--off" />
              Акция
            </li>
          </ul>
        )}
      </div>

      {view === 'month1' && (doc.meta?.base_hours_note || doc.meta?.day_hours_note) ? (
        <p className="tz-price-list__hours muted">
          {doc.meta.base_hours_note ? <span>База: {doc.meta.base_hours_note}</span> : null}
          {doc.meta.day_hours_note ? <span>День: {doc.meta.day_hours_note}</span> : null}
        </p>
      ) : null}

      {empty ? (
        <div className="price-list__empty">
          <p className="price-list__empty-title">Сетка ещё пустая</p>
          <p className="muted price-list__hint">
            Нажмите «Excel» и загрузите прайс ТЗ клуба (листы «1 мес» и «акции»).
          </p>
        </div>
      ) : null}

      {!empty && view === 'month1' ? (
        <div className="price-list__matrix">
          <div className="price-list__scroll">
            <table className="price-list__table tz-price-list__table">
              <thead>
                <tr>
                  <th scope="col" className="price-list__sticky price-list__axis price-list__axis--head">
                    Срок
                  </th>
                  <th scope="col" className="price-list__sticky price-list__sticky--2 price-list__axis">
                    Тренировки
                  </th>
                  <th scope="col">База полная</th>
                  <th scope="col" className="tz-price-list__col-stand">
                    База стенд
                  </th>
                  <th scope="col">Экон.</th>
                  <th scope="col" className="tz-price-list__col-day">
                    День стенд
                  </th>
                  <th scope="col">Экон.</th>
                </tr>
              </thead>
              <tbody>
                {(doc.month1_rows ?? []).map((r, idx) => (
                  <tr key={r.id} className={idx % 2 ? 'tz-price-list__row--band' : undefined}>
                    <th scope="row" className="price-list__sticky price-list__axis">
                      {formatTzMonthsLabel(r.months)}
                    </th>
                    <td className="price-list__sticky price-list__sticky--2 price-list__axis">{formatTzSessionsLabel(r.sessions)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="price-list__input"
                        value={r.base_full ?? ''}
                        onChange={(e) => setMonth1Field(r.id, 'base_full', e.target.value)}
                        aria-label="База полная"
                      />
                    </td>
                    <td className="tz-price-list__col-stand">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="price-list__input price-list__input--discount"
                        value={r.base_stand ?? ''}
                        onChange={(e) => setMonth1Field(r.id, 'base_stand', e.target.value)}
                        aria-label="База стенд"
                      />
                    </td>
                    <td className="tz-price-list__computed">{formatPriceListMoney(r.base_save)}</td>
                    <td className="tz-price-list__col-day">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="price-list__input price-list__input--discount"
                        value={r.day_stand ?? ''}
                        onChange={(e) => setMonth1Field(r.id, 'day_stand', e.target.value)}
                        aria-label="День стенд"
                      />
                    </td>
                    <td className="tz-price-list__computed">{formatPriceListMoney(r.day_save)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="price-list__scroll-hint muted">Колонка «стенд» — цена на витрине</p>
        </div>
      ) : null}

      {!empty && view === 'promo' ? (
        <div className="price-list__matrix">
          <div className="price-list__scroll">
            <table className="price-list__table tz-price-list__table">
              <thead>
                <tr>
                  <th scope="col" className="price-list__sticky price-list__axis price-list__axis--head">
                    Срок
                  </th>
                  <th scope="col" className="price-list__sticky price-list__sticky--2 price-list__axis">
                    Тренировки
                  </th>
                  <th scope="col">База</th>
                  <th scope="col" className="tz-price-list__col-stand">
                    Акция
                  </th>
                  <th scope="col">Экономия</th>
                  <th scope="col">₽ / мес</th>
                </tr>
              </thead>
              <tbody>
                {(doc.promo_rows ?? []).map((r, idx) => (
                  <tr key={r.id} className={idx % 2 ? 'tz-price-list__row--band' : undefined}>
                    <th scope="row" className="price-list__sticky price-list__axis">
                      {formatTzMonthsLabel(r.months)}
                    </th>
                    <td className="price-list__sticky price-list__sticky--2 price-list__axis">{formatTzSessionsLabel(r.sessions)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="price-list__input"
                        value={r.base_full ?? ''}
                        onChange={(e) => setPromoField(r.id, 'base_full', e.target.value)}
                        aria-label="База"
                      />
                    </td>
                    <td className="tz-price-list__col-stand">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="price-list__input price-list__input--discount"
                        value={r.promo ?? ''}
                        onChange={(e) => setPromoField(r.id, 'promo', e.target.value)}
                        aria-label="Акция"
                      />
                    </td>
                    <td className="tz-price-list__computed">{formatPriceListMoney(r.save)}</td>
                    <td className="tz-price-list__computed">{formatPriceListMoney(r.month_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
