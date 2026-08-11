import { useCallback, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, ImageDown, Printer, RefreshCw, Save } from 'lucide-react'
import {
  addAzDirection,
  addAzOtherFee,
  addAzSessionCount,
  azPriceListHasGrid,
  emptyAzPriceListDocument,
  normalizeAzPriceListDocument,
  parseAzMoney,
  removeAzDirection,
  removeAzOtherFee,
  removeAzSessionCount,
  renameAzDirection,
  seedAzPriceListDefaults,
  setAzPriceListCell,
  updateAzOtherFee,
} from '../../lib/priceList/azPriceListCore.js'
import { fetchAzPriceListForClub, saveAzPriceListForClub } from '../../lib/priceList/azPriceListCloudService.js'
import { azPriceListLocalHasContent, readAzPriceListLocalEntry } from '../../lib/priceList/azPriceListLocalStorage.js'
import { importAzPriceListFromExcelBuffer } from '../../lib/priceList/azPriceListExcelWorkbook.js'
import {
  downloadAzPriceListPng,
  printAzPriceListDocument,
} from '../../lib/priceList/azPriceListExportCanvas.js'
import { buildAzPriceListPrintSheets } from '../../lib/priceList/azPriceListPrintChrome.js'
import { AzPriceListStandFields } from './AzPriceListStandFields.jsx'
import { AzPriceListMatrix } from './AzPriceListMatrix.jsx'
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

  const handleSeed = () => {
    const has =
      (doc.result_directions?.length || 0) +
      (doc.class_directions?.length || 0) +
      (doc.session_counts?.length || 0)
    if (has > 0 && !window.confirm('Заменить текущую сетку типовой? Цены в ячейках останутся, структура направлений сбросится.'))
      return
    patchDoc((prev) => seedAzPriceListDefaults(prev, { replace: true }))
    setToast('Типовая сетка АЗ: Результат1+/2+/3+, Йога/Бокс/Степ, 4/8/10. Заполните цены и сохраните.')
  }

  const handleAddSession = () => {
    const raw = window.prompt('Число занятий в новой строке', '12')
    if (raw == null) return
    const n = Number(String(raw).replace(/\D/g, ''))
    if (!(n > 0)) {
      setToast('Нужно целое число занятий больше 0')
      return
    }
    patchDoc((prev) => addAzSessionCount(prev, n))
  }

  const handlePrint = () => {
    const result = printAzPriceListDocument(doc)
    if (!result.ok) setToast(result.error || 'Печать недоступна')
    else setToast('Если в диалоге стоит «Книжная» — переключите на «Альбомная»')
  }

  const handlePng = async () => {
    if (!buildAzPriceListPrintSheets(doc).length) {
      setToast('Сначала создайте сетку / загрузите Excel')
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
  const dirKind = view === 'classes' ? 'classes' : 'result'

  return (
    <section className="card price-list az-price-list os-enter" aria-label="Прайс аэробного зала">
      <header className="price-list__head">
        <div className="price-list__head-text">
          <p className="price-list__eyebrow">Витрина клуба</p>
          <h2 className="price-list__title">Прайс · аэробный зал</h2>
          <p className="price-list__lead">
            Как на стенде: направления × тренировки, полная и −10% (автосвязь). Сетка без Excel или
            импорт — правка — Сохранить. Печать и PNG — все заполненные листы.
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
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={handleSeed}
            title="Типовые направления Результат + групповые, 4/8/10"
          >
            Типовая сетка
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
            «Типовая сетка» — направления как на стенде, или «Excel» с прайсом клуба.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSeed}>
            Создать типовую сетку
          </button>
        </div>
      ) : (
        <AzPriceListMatrix
          view={view}
          doc={doc}
          onCell={setCell}
          onRenameDirection={(id, label) =>
            patchDoc((prev) => renameAzDirection(prev, dirKind, id, label))
          }
          onRemoveDirection={(id) => patchDoc((prev) => removeAzDirection(prev, dirKind, id))}
          onAddDirection={() => patchDoc((prev) => addAzDirection(prev, dirKind))}
          onAddSession={handleAddSession}
          onRemoveSession={(s) => patchDoc((prev) => removeAzSessionCount(prev, s))}
          onFeeChange={(id, patch) => patchDoc((prev) => updateAzOtherFee(prev, id, patch))}
          onAddFee={() => patchDoc((prev) => addAzOtherFee(prev))}
          onRemoveFee={(id) => patchDoc((prev) => removeAzOtherFee(prev, id))}
        />
      )}
    </section>
  )
}
