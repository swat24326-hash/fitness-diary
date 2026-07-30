import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save, X } from 'lucide-react'
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
import '../../styles/price-list.css'

/**
 * Прайс ПЗ — админ, свой на клуб. Колонки = платные типы (без БЗ).
 * Витрина: матрица сравнения + базовая/−10% (канон Ось / Whoop-дисциплина).
 *
 * @param {{ clubId: string, membershipTypes?: object[] }} props
 */
export function AdminPriceListSection({ clubId, membershipTypes = [] }) {
  const [doc, setDoc] = useState(() => emptyPriceListDocument({ club_id: clubId }))
  const [mode, setMode] = useState('base')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [dirty, setDirty] = useState(false)

  const catalogTypes = useMemo(() => filterPriceListCatalogTypes(membershipTypes), [membershipTypes])

  const reload = useCallback(async () => {
    if (!clubId) {
      setDoc(emptyPriceListDocument())
      setDirty(false)
      setToast('')
      return
    }
    setBusy(true)
    const result = await fetchPriceListForClub(clubId)
    setBusy(false)
    setDoc(result.doc)
    setDirty(false)
    if (!result.ok && result.error) {
      setToast(result.error)
      return
    }
    if (result.source === 'local' && result.error) {
      setToast(`Облако недоступно — показан локальный кэш. ${result.error}`)
    } else if (result.source === 'cloud' || result.exists) {
      setToast('')
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

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
            Сетка как на стенде: сравнение карт, две цены в колонке. БЗ не входит. Убранную карту вернёт
            «Сверить с типами». Сохранение — в облако по клубу.
          </p>
        </div>
        <div className="price-list__actions">
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
            onClick={() => void reload()}
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

      <div className="price-list__stand" aria-label="Шапка стенда">
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

      <div className="price-list__toolbar">
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

      {!tariffs.length && catalogTypes.length ? (
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
                                className="price-list__input"
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
                            </td>
                            <td className="price-list__cell price-list__cell--discount">
                              <input
                                type="number"
                                inputMode="numeric"
                                className="price-list__input price-list__input--discount"
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
          <p className="price-list__scroll-hint muted">Листайте вбок, чтобы сравнить все карты</p>
        </div>
      ) : null}

      <p className="price-list__footnote muted">
        Акцент на колонке «−10%» — как цена на стенде. VIP подсвечен. Печать / менеджер — следующим шагом.
      </p>

      {toast ? (
        <p className="sync-feedback sync-feedback--ok" role="status">
          {toast}
        </p>
      ) : null}
    </section>
  )
}
