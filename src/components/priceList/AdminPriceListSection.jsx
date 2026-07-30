import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Printer, ImageDown, RefreshCw, Save, X } from 'lucide-react'
import {
  buildPriceListRows,
  emptyPriceListDocument,
  filterPriceListCatalogTypes,
  getPriceListCell,
  normalizePriceListMode,
  PRICE_LIST_PEOPLE_OPTIONS,
  removePriceListTariff,
  setPriceListCell,
  syncTariffsFromMembershipTypes,
  togglePriceListPeople,
} from '../../lib/priceList/priceListCore.js'
import { fetchPriceListForClub, savePriceListForClub } from '../../lib/priceList/priceListCloudService.js'
import { readPriceListLocalEntry } from '../../lib/priceList/priceListLocalStorage.js'
import { downloadPriceListPng, printPriceListDocument } from '../../lib/priceList/priceListExportCanvas.js'
import { formatPriceListMoney, priceListModePrintLabel } from '../../lib/priceList/priceListExportCore.js'
import { PriceListExcelImportWizard } from './PriceListExcelImportWizard.jsx'
import '../../styles/price-list.css'

/**
 * Прайс ПЗ — админ или менеджер своего клуба (полное редактирование).
 *
 * @param {{ clubId: string, membershipTypes?: object[] }} props
 */
export function AdminPriceListSection({ clubId, membershipTypes = [] }) {
  const [doc, setDoc] = useState(() =>
    clubId ? readPriceListLocalEntry(clubId).doc : emptyPriceListDocument({ club_id: clubId }),
  )
  const [mode, setMode] = useState('base')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [dirty, setDirty] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const catalogTypes = useMemo(() => filterPriceListCatalogTypes(membershipTypes), [membershipTypes])

  const applyFetchResult = useCallback((result, { keepDirty = false } = {}) => {
    setDoc(result.doc)
    if (!keepDirty) setDirty(false)
    if (!result.ok && result.error) {
      setToast(result.error)
      return
    }
    if (result.source === 'local' && result.error) {
      setToast(`Облако недоступно — показан локальный кэш. ${result.error}`)
    } else if (result.fromCache && result.source === 'local') {
      setToast('')
    } else if (result.source === 'cloud' || result.exists) {
      setToast('')
    }
  }, [])

  /** @param {{ force?: boolean }} [opts] */
  const reload = useCallback(
    async (opts = {}) => {
      if (!clubId) {
        setDoc(emptyPriceListDocument())
        setDirty(false)
        setToast('')
        return
      }
      const force = Boolean(opts.force)
      const entry = readPriceListLocalEntry(clubId)
      // Сразу локальный кэш — без спиннера на всю сетку
      if (entry.doc && (entry.doc.updated_at || entry.doc.tariffs?.length)) {
        setDoc(entry.doc)
        if (!force) setDirty(false)
      }
      if (!force && entry.fresh) {
        setBusy(false)
        return
      }
      setBusy(true)
      const result = await fetchPriceListForClub(clubId, { force })
      setBusy(false)
      applyFetchResult(result)
    },
    [applyFetchResult, clubId],
  )

  useEffect(() => {
    void reload({ force: false })
  }, [reload])

  useEffect(() => {
    document.body.classList.remove('price-list-printing')
    return () => {
      document.body.classList.remove('price-list-printing')
      document.querySelectorAll('iframe[data-price-list-print-frame]').forEach((el) => el.remove())
    }
  }, [])
  const rows = useMemo(() => buildPriceListRows(doc), [doc])
  const tariffs = doc.tariffs ?? []
  const peopleSet = useMemo(() => new Set(doc.people ?? []), [doc.people])
  const sessionBand = useMemo(() => {
    const map = new Map()
    let band = 0
    let prev = null
    for (const row of rows) {
      if (prev !== null && row.sessions !== prev) band += 1
      map.set(`${row.sessions}-${row.people}`, band % 2)
      prev = row.sessions
    }
    return map
  }, [rows])

  const handleSyncColumns = () => {
    setDoc((prev) => syncTariffsFromMembershipTypes(prev, membershipTypes, { replace: false }))
    setDirty(true)
    setToast('Колонки сверены: платные ПЗ без БЗ. Удалённые карты снова в сетке.')
  }

  const handlePrint = () => {
    const result = printPriceListDocument(doc, { mode })
    if (!result.ok) setToast(result.error || 'Печать недоступна')
    else setToast('Если в диалоге стоит «Книжная» — переключите на «Альбомная»')
  }

  const handlePng = async () => {
    if (!(doc.tariffs ?? []).length) {
      setToast('Сначала соберите колонки («Сверить с типами» или Excel)')
      return
    }
    setBusy(true)
    try {
      const result = await downloadPriceListPng(doc, { mode })
      setToast(result.ok ? `PNG сохранён: ${result.filename}` : 'Не удалось сделать PNG')
    } catch (e) {
      setToast(e?.message ? String(e.message) : 'Ошибка PNG')
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    setBusy(true)
    const result = await savePriceListForClub(clubId, doc)
    setBusy(false)
    if (!result.ok) {
      setToast(result.error || 'Ошибка сохранения')
      return
    }
    setDoc(result.doc)
    setDirty(false)
    setToast('Прайс сохранён в облаке для этого клуба')
  }

  const handleValidFrom = (value) => {
    setDoc((prev) => ({ ...prev, valid_from: value || null }))
    setDirty(true)
  }

  const handleMeta = (field, value) => {
    setDoc((prev) => ({
      ...prev,
      meta: { ...prev.meta, [field]: value },
    }))
    setDirty(true)
  }

  const handlePeopleToggle = (n) => {
    setDoc((prev) => togglePriceListPeople(prev, n))
    setDirty(true)
  }

  const handleRemoveTariff = (membershipTypeId) => {
    setDoc((prev) => removePriceListTariff(prev, membershipTypeId))
    setDirty(true)
    setToast('Карта убрана с прайса. Вернуть — «Сверить с типами».')
  }

  const handleCellChange = (sessions, people, membershipTypeId, field, raw) => {
    const trimmed = String(raw ?? '').trim()
    const num = trimmed === '' ? null : Number(trimmed.replace(',', '.'))
    const patch = {
      sessions,
      people,
      membershipTypeId,
      mode,
    }
    if (field === 'full') patch.price_full = trimmed === '' ? null : num
    else patch.price_10 = trimmed === '' ? null : num
    setDoc((prev) => setPriceListCell(prev, patch))
    setDirty(true)
  }

  if (!clubId) {
    return (
      <section className="card price-list" aria-label="Прайс">
        <p className="muted">Выберите клуб в шапке — у каждого клуба свой прайс.</p>
      </section>
    )
  }

  return (
    <section className="card price-list os-enter" aria-label="Прайс персонального зала">
      <header className="price-list__head">
        <div className="price-list__head-text">
          <p className="price-list__eyebrow">Витрина клуба</p>
          <h2 className="price-list__title">Прайс · персональный зал</h2>
          <p className="price-list__lead">
            Сетка как на стенде: сравнение карт, две цены в колонке. БЗ не входит. Убранную карту
            вернёт «Сверить с типами». Сохранение — в облако по клубу; менеджер своего клуба тоже
            может править.
          </p>
        </div>
        <div className="price-list__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePrint}
            disabled={!(doc.tariffs ?? []).length}
            title="Печать витрины (текущий режим сетки)"
          >
            <Printer size={16} aria-hidden />
            Печать
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handlePng()}
            disabled={busy || !(doc.tariffs ?? []).length}
            title="Скачать PNG текущего режима"
          >
            <ImageDown size={16} aria-hidden />
            PNG
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setImportOpen((v) => !v)}
            title="Загрузить цены из Excel и сопоставить с типами"
          >
            <FileSpreadsheet size={16} aria-hidden />
            Excel
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSyncColumns}
            disabled={!catalogTypes.length}
            title="Собрать колонки из платных типов ПЗ и вернуть убранные"
          >
            Сверить с типами
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-square"
            onClick={() => void reload({ force: true })}
            disabled={busy}
            aria-label="Обновить из облака"
            title="Обновить из облака"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={busy || !dirty}
            aria-busy={busy}
          >
            <Save size={16} aria-hidden />
            Сохранить
          </button>
        </div>
      </header>

      {importOpen ? (
        <PriceListExcelImportWizard
          clubId={clubId}
          doc={doc}
          membershipTypes={membershipTypes}
          onClose={() => setImportOpen(false)}
          onApply={(nextDoc, meta) => {
            setDoc(nextDoc)
            setDirty(true)
            setImportOpen(false)
            setToast(
              `Импорт: ${meta.applied} ячеек` +
                (meta.skippedUnmapped ? `, пропущено без типа: ${meta.skippedUnmapped}` : '') +
                '. Сохраните в облако.',
            )
          }}
        />
      ) : null}

      <div className="price-list__print-surface" data-price-list-print-root data-print-mode={mode}>
      <header className="price-list__print-banner" aria-hidden="true">
        <div className="price-list__print-banner-main">
          <p className="price-list__print-title">{doc.meta?.title || 'Персональный зал'}</p>
          <p className="price-list__print-mode">{priceListModePrintLabel(mode)}</p>
        </div>
        <div className="price-list__print-banner-meta">
          {doc.valid_from ? (
            <span>
              Цены с{' '}
              {(() => {
                const m = String(doc.valid_from).match(/^(\d{4})-(\d{2})-(\d{2})/)
                return m ? `${m[3]}.${m[2]}.${m[1]}` : doc.valid_from
              })()}
            </span>
          ) : null}
          {doc.meta?.address ? <span>{doc.meta.address}</span> : null}
          {doc.meta?.phone ? <span>{doc.meta.phone}</span> : null}
        </div>
      </header>

      <div className="price-list__stand price-list__no-print" aria-label="Шапка стенда">
        <div className="price-list__stand-glow" aria-hidden />
        <div className="price-list__meta">
          <label className="price-list__field">
            <span className="price-list__label">Цены с</span>
            <input
              type="date"
              className="input price-list__input-field"
              value={doc.valid_from ?? ''}
              onChange={(e) => handleValidFrom(e.target.value)}
            />
          </label>
          <label className="price-list__field price-list__field--grow">
            <span className="price-list__label">Адрес на стенде</span>
            <input
              type="text"
              className="input price-list__input-field"
              value={doc.meta?.address ?? ''}
              onChange={(e) => handleMeta('address', e.target.value)}
              placeholder="Город, улица, ТЦ…"
            />
          </label>
          <label className="price-list__field">
            <span className="price-list__label">Телефон</span>
            <input
              type="text"
              className="input price-list__input-field"
              value={doc.meta?.phone ?? ''}
              onChange={(e) => handleMeta('phone', e.target.value)}
              placeholder="8-…"
            />
          </label>
        </div>
      </div>

      <div className="price-list__toolbar price-list__no-print">
        <div className="price-list__mode" role="tablist" aria-label="Режим цены">
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${mode === 'base' ? ' is-active' : ''}`}
            aria-selected={mode === 'base'}
            onClick={() => setMode('base')}
          >
            Базовая сетка
          </button>
          <button
            type="button"
            role="tab"
            className={`price-list__mode-btn${mode === 'day' ? ' is-active' : ''}`}
            aria-selected={mode === 'day'}
            onClick={() => setMode('day')}
          >
            Дневная скидка
          </button>
        </div>

        <div className="price-list__people" role="group" aria-label="Число людей в сетке">
          <span className="price-list__label">Людей</span>
          <div className="price-list__people-chips">
            {PRICE_LIST_PEOPLE_OPTIONS.map((n) => {
              const on = peopleSet.has(n)
              return (
                <button
                  key={n}
                  type="button"
                  className={`price-list__chip${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() => handlePeopleToggle(n)}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        <ul className="price-list__legend" aria-label="Легенда цен">
          <li>
            <span className="price-list__legend-swatch price-list__legend-swatch--full" />
            Базовая
          </li>
          <li>
            <span className="price-list__legend-swatch price-list__legend-swatch--off" />
            −10%
          </li>
        </ul>
      </div>

      {!catalogTypes.length ? (
        <p className="sync-feedback sync-feedback--warn" role="status">
          Нет платных типов ПЗ (БЗ не считается). Заведите карты в справочнике абонементов.
        </p>
      ) : null}

      {!tariffs.length ? (
        <div className="price-list__empty">
          <p className="price-list__empty-title">Сетка ещё пустая</p>
          <p className="muted price-list__hint">
            Нажмите «Сверить с типами» — соберём колонки по кодам клуба (без БЗ).
          </p>
        </div>
      ) : null}

      {tariffs.length ? (
        <div className="price-list__matrix">
          <div className="price-list__scroll">
            <table className="price-list__table">
              <thead>
                <tr>
                  <th
                    scope="col"
                    rowSpan={2}
                    className="price-list__sticky price-list__axis price-list__axis--head"
                  >
                    Трен./мес
                  </th>
                  <th
                    scope="col"
                    rowSpan={2}
                    className="price-list__sticky price-list__sticky--2 price-list__axis price-list__axis--head"
                  >
                    Людей
                  </th>
                  {tariffs.map((t) => (
                    <th
                      key={t.membership_type_id}
                      scope="col"
                      colSpan={2}
                      className={`price-list__tariff${t.is_vip ? ' price-list__tariff--vip' : ''}`}
                    >
                      <span className="price-list__tariff-top">
                        <span className="price-list__tariff-code">{t.code}</span>
                        {t.is_vip ? <span className="price-list__vip-badge">VIP</span> : null}
                        <button
                          type="button"
                          className="price-list__tariff-remove"
                          onClick={() => handleRemoveTariff(t.membership_type_id)}
                          aria-label={`Убрать ${t.code} с прайса`}
                          title="Убрать с прайса. Вернуть — «Сверить с типами»"
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="price-list__subhead-row">
                  {tariffs.map((t) => (
                    <Fragment key={`${t.membership_type_id}-sub`}>
                      <th scope="col" className="price-list__subhead">
                        Базовая
                      </th>
                      <th scope="col" className="price-list__subhead price-list__subhead--discount">
                        −10%
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const showSessions = row.people === (doc.people?.[0] ?? 1)
                  const band = sessionBand.get(`${row.sessions}-${row.people}`) ?? 0
                  return (
                    <tr
                      key={`${row.sessions}-${row.people}`}
                      className={`price-list__row${band ? ' price-list__row--alt' : ''}${showSessions ? ' price-list__row--block-start' : ''}`}
                    >
                      <th scope="row" className="price-list__sticky price-list__axis">
                        {showSessions ? (
                          <span className="price-list__sessions-pill">{row.sessions}</span>
                        ) : (
                          ''
                        )}
                      </th>
                      <td className="price-list__sticky price-list__sticky--2 price-list__axis">
                        {row.people}
                      </td>
                      {tariffs.map((t) => {
                        const cell = getPriceListCell(doc, {
                          sessions: row.sessions,
                          people: row.people,
                          membershipTypeId: t.membership_type_id,
                          mode: normalizePriceListMode(mode),
                        })
                        return (
                          <Fragment key={t.membership_type_id}>
                            <td className="price-list__cell">
                              <input
                                type="number"
                                inputMode="numeric"
                                className="price-list__input price-list__screen-only"
                                min={0}
                                step={1}
                                value={cell.price_full ?? ''}
                                onChange={(e) =>
                                  handleCellChange(
                                    row.sessions,
                                    row.people,
                                    t.membership_type_id,
                                    'full',
                                    e.target.value,
                                  )
                                }
                                aria-label={`${t.code}, ${row.sessions} трен., ${row.people} чел., базовая`}
                                title="Базовая стоимость"
                              />
                              <span className="price-list__print-cell">{formatPriceListMoney(cell.price_full)}</span>
                            </td>
                            <td className="price-list__cell price-list__cell--discount">
                              <input
                                type="number"
                                inputMode="numeric"
                                className="price-list__input price-list__input--discount price-list__screen-only"
                                min={0}
                                step={1}
                                value={cell.price_10 ?? ''}
                                onChange={(e) =>
                                  handleCellChange(
                                    row.sessions,
                                    row.people,
                                    t.membership_type_id,
                                    '10',
                                    e.target.value,
                                  )
                                }
                                aria-label={`${t.code}, ${row.sessions} трен., ${row.people} чел., −10%`}
                                title="Цена со скидкой 10%"
                              />
                              <span className="price-list__print-cell price-list__print-cell--discount">
                                {formatPriceListMoney(cell.price_10)}
                              </span>
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="price-list__scroll-hint muted price-list__no-print">Листайте вбок, чтобы сравнить все карты</p>
        </div>
      ) : null}
      </div>

      <p className="price-list__footnote muted price-list__no-print">
        Акцент на «−10%» — цена стенда. Печать и PNG — текущий режим (базовая / дневная).
      </p>

      {toast ? (
        <p className="sync-feedback sync-feedback--ok" role="status">
          {toast}
        </p>
      ) : null}
    </section>
  )
}
