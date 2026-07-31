import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, ImageDown, Printer, RefreshCw, Save } from 'lucide-react'
import {
  azPriceListHasGrid,
  emptyAzPriceListDocument,
  getAzPriceListCell,
  normalizeAzPriceListDocument,
  parseAzMoney,
  setAzPriceListCell,
} from '../../lib/priceList/azPriceListCore.js'
import { fetchAzPriceListForClub, saveAzPriceListForClub } from '../../lib/priceList/azPriceListCloudService.js'
import { azPriceListLocalHasContent, readAzPriceListLocalEntry } from '../../lib/priceList/azPriceListLocalStorage.js'
import { importAzPriceListFromExcelBuffer } from '../../lib/priceList/azPriceListExcelWorkbook.js'
import {
  downloadAzPriceListPng,
  printAzPriceListDocument,
} from '../../lib/priceList/azPriceListExportCanvas.js'
import { buildAzPriceListPrintSheets } from '../../lib/priceList/azPriceListPrintChrome.js'
import { formatPriceListMoney } from '../../lib/priceList/priceListExportCore.js'
import { AzPriceListStandFields } from './AzPriceListStandFields.jsx'
import '../../styles/price-list.css'
import '../../styles/az-price-list.css'

/**
 * Прайс АЗ — витрина направлений × сессии (полная / −10%).
 *
 * @param {{ clubId: string }} props
 */
export function AdminAzPriceListSection({ clubId }) {
  const [doc, setDoc] = useState(() =>
    clubId ? readAzPriceListLocalEntry(clubId).doc : emptyAzPriceListDocument({ club_id: clubId }),
  )
  const [view, setView] = useState(/** @type {'result' | 'classes' | 'fees'} */ ('result'))
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
        setDoc(emptyAzPriceListDocument())
        setDirty(false)
        return
      }
      const force = Boolean(opts.force)
      const entry = readAzPriceListLocalEntry(clubId)
      if (azPriceListLocalHasContent(entry.doc)) {
        setDoc(entry.doc)
        if (!force) setDirty(false)
      }
      if (!force && entry.fresh) return
      setBusy(true)
      const result = await fetchAzPriceListForClub(clubId, { force })
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
      return normalizeAzPriceListDocument(next, clubId)
    })
    setDirty(true)
  }

  const save = async () => {
    if (!clubId || busy) return
    setBusy(true)
    const result = await saveAzPriceListForClub(clubId, doc)
    setBusy(false)
    if (!result.ok) {
      setToast(result.error || 'Не удалось сохранить')
      return
    }
    setDoc(result.doc)
    setDirty(false)
    setToast('Прайс АЗ сохранён в облаке для этого клуба')
  }

  const onExcel = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const res = importAzPriceListFromExcelBuffer(buf, { clubId })
      if (!res.ok) {
        setToast(res.error || 'Импорт не удался')
        return
      }
      setDoc(res.doc)
      setDirty(true)
      setToast(
        `Импорт: ${res.stats.result} «Результат», ${res.stats.classes} групповых, ${res.stats.fees} доплат. Сохраните в облако.`,
      )
    } catch (e) {
      setToast(e?.message || 'Ошибка чтения Excel')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setCell = (sessions, directionId, field, raw) => {
    const trimmed = String(raw ?? '').trim()
    const num = trimmed === '' ? null : parseAzMoney(trimmed)
    patchDoc((prev) =>
      setAzPriceListCell(prev, {
        sessions,
        directionId,
        ...(field === 'full' ? { price_full: num } : { price_10: num }),
      }),
    )
  }

  const setFeeAmount = (id, raw) => {
    const amount = String(raw ?? '').trim() === '' ? null : parseAzMoney(raw)
    patchDoc((prev) => ({
      ...prev,
      extras: {
        ...prev.extras,
        other_fees: (prev.extras?.other_fees ?? []).map((f) =>
          f.id === id ? { ...f, amount } : f,
        ),
      },
    }))
  }

  const handlePrint = () => {
    const result = printAzPriceListDocument(doc)
    if (!result.ok) setToast(result.error || 'Печать недоступна')
    else setToast('Если в диалоге стоит «Книжная» — переключите на «Альбомная»')
  }

  const handlePng = async () => {
    if (!buildAzPriceListPrintSheets(doc).length) {
      setToast('Сначала загрузите Excel / заполните сетку')
      return
    }
    setBusy(true)
    try {
      const result = await downloadAzPriceListPng(doc)
      if (!result.ok) setToast('Не удалось сделать PNG')
      else if (result.count > 1) setToast(`PNG: ${result.count} листа (Результат / Групповые / Доплаты)`)
      else setToast(`PNG сохранён: ${result.filename}`)
    } catch (e) {
      setToast(e?.message ? String(e.message) : 'Ошибка PNG')
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <section className="card price-list" aria-label="Прайс АЗ">
        <p className="muted">Выберите клуб в шапке — у каждого клуба свой прайс.</p>
      </section>
    )
  }

  const hasGrid = azPriceListHasGrid(doc)
  const hasFees = (doc.extras?.other_fees ?? []).length > 0 || doc.extras?.evening_pt_surcharge != null
  const empty = !hasGrid && !hasFees
  const directions = view === 'classes' ? doc.class_directions ?? [] : doc.result_directions ?? []
  const sessions = doc.session_counts ?? []

  return (
    <section className="card price-list az-price-list os-enter" aria-label="Прайс аэробного зала">
      <header className="price-list__head">
        <div className="price-list__head-text">
          <p className="price-list__eyebrow">Витрина клуба</p>
          <h2 className="price-list__title">Прайс · аэробный зал</h2>
          <p className="price-list__lead">
            Как на стенде: направления × тренировки, две цены в колонке (полная / −10%). Импорт Excel —
            правка — Сохранить. Печать и PNG — все заполненные листы (Результат, Групповые, Доплаты).
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
            title="Загрузить прайс АЗ из Excel"
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
        <p
          className={`sync-feedback sync-feedback--${/ошиб|не удалось|неудал/i.test(toast) ? 'err' : 'ok'}`}
          role="status"
        >
          {toast}
        </p>
      ) : null}

      <AzPriceListStandFields
        doc={doc}
        onValidFrom={(value) => patchDoc({ ...doc, valid_from: value || null })}
        onMeta={(patch) => patchDoc({ ...doc, meta: { ...doc.meta, ...patch } })}
        onExtras={(patch) => {
          const next = { ...doc.extras }
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'other_fees') next.other_fees = v
            else next[k] = v === '' || v == null ? null : parseAzMoney(v)
          }
          patchDoc({ ...doc, extras: next })
        }}
      />

      <div className="price-list__toolbar">
        <div className="price-list__mode" role="tablist" aria-label="Лист прайса АЗ">
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${view === 'result' ? ' is-active' : ''}`}
            aria-selected={view === 'result'}
            onClick={() => setView('result')}
          >
            Результат
          </button>
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${view === 'classes' ? ' is-active' : ''}`}
            aria-selected={view === 'classes'}
            onClick={() => setView('classes')}
          >
            Групповые
          </button>
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${view === 'fees' ? ' is-active' : ''}`}
            aria-selected={view === 'fees'}
            onClick={() => setView('fees')}
          >
            Доплаты
          </button>
        </div>

        {view !== 'fees' ? (
          <ul className="price-list__legend" aria-label="Легенда цен">
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--full" />
              Полная
            </li>
            <li>
              <span className="price-list__legend-swatch price-list__legend-swatch--off" />
              Стенд (−10%)
            </li>
          </ul>
        ) : null}
      </div>

      {empty ? (
        <div className="price-list__empty">
          <p className="price-list__empty-title">Сетка ещё пустая</p>
          <p className="muted price-list__hint">
            Нажмите «Excel» и загрузите прайс АЗ клуба (листы «АЗ», «Лист1», «Доплаты»).
          </p>
        </div>
      ) : null}

      {!empty && (view === 'result' || view === 'classes') ? (
        directions.length === 0 ? (
          <p className="muted price-list__hint">Нет направлений на этом листе — загрузите Excel.</p>
        ) : (
          <div className="price-list__matrix">
            <div className="price-list__scroll">
              <table className="price-list__table az-price-list__table">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="price-list__sticky price-list__axis price-list__axis--head"
                    >
                      Трен.
                    </th>
                    {directions.map((d) => (
                      <th key={d.id} colSpan={2} className="price-list__tariff">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="price-list__subhead-row">
                    {directions.map((d) => (
                      <Fragment key={`${d.id}-sub`}>
                        <th scope="col" className="price-list__subhead">
                          Полная
                        </th>
                        <th
                          scope="col"
                          className="price-list__subhead price-list__subhead--discount az-price-list__col-stand"
                        >
                          −10%
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, ri) => (
                    <tr key={s} className={ri % 2 ? 'az-price-list__row--band' : undefined}>
                      <th className="price-list__sticky price-list__axis">{s}</th>
                      {directions.map((d) => {
                        const cell = getAzPriceListCell(doc, { sessions: s, directionId: d.id })
                        return (
                          <Fragment key={`${s}-${d.id}`}>
                            <td>
                              <input
                                type="number"
                                inputMode="numeric"
                                className="input price-list__cell-input"
                                min={0}
                                step={1}
                                value={cell.price_full ?? ''}
                                onChange={(e) => setCell(s, d.id, 'full', e.target.value)}
                                aria-label={`${d.label} полная, ${s} тр.`}
                              />
                            </td>
                            <td className="az-price-list__col-stand">
                              <input
                                type="number"
                                inputMode="numeric"
                                className="input price-list__cell-input"
                                min={0}
                                step={1}
                                value={cell.price_10 ?? ''}
                                onChange={(e) => setCell(s, d.id, 'off', e.target.value)}
                                aria-label={`${d.label} стенд, ${s} тр.`}
                              />
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="price-list__scroll-hint muted">Колонка стенда — цена −10%</p>
          </div>
        )
      ) : null}

      {!empty && view === 'fees' ? (
        <div className="az-price-list__fees">
          {doc.extras?.evening_pt_surcharge != null ? (
            <p className="az-price-list__fee-note">
              Доплата ПТ по дневному абонементу вечером:{' '}
              <strong>{formatPriceListMoney(doc.extras.evening_pt_surcharge)}</strong>
            </p>
          ) : null}
          {(doc.extras?.other_fees ?? []).length === 0 ? (
            <p className="muted">Нет прочих доплат — загрузите лист «Доплаты» из Excel.</p>
          ) : (
            <table className="price-list__table az-price-list__fees-table">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {(doc.extras.other_fees ?? []).map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="input price-list__cell-input"
                        min={0}
                        step={1}
                        value={f.amount ?? ''}
                        onChange={(e) => setFeeAmount(f.id, e.target.value)}
                        aria-label={f.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  )
}
