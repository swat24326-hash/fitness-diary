import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  deactivateMembershipType,
  insertMembershipType,
  insertAerobicMembershipType,
  listMembershipTypesForClub,
  normalizeMembershipTypeCode,
  updateMembershipTypePay,
  updateAerobicMembershipPay,
  filterAerobicSalesTypes,
  filterTrainerAssignableTypes,
} from '../../lib/membershipTypesService'
import { pullMembershipTypesForClubFromCloud } from '../../lib/pullReferenceData'

function splitActiveInactive(items) {
  const active = []
  const inactive = []
  for (const t of items ?? []) {
    if (t.is_active === false) inactive.push(t)
    else active.push(t)
  }
  return { active, inactive }
}

function ZoneBadge({ zone }) {
  const label = zone === 'az' ? 'АЗ' : 'ПЗ'
  return <span className={`admin-mt-badge admin-mt-badge--${zone}`}>{label}</span>
}

function TypeChips({ items, zone, emptyLabel }) {
  const { active, inactive } = splitActiveInactive(items)
  if (!items?.length) {
    return <p className="muted admin-mt-catalog__empty">{emptyLabel}</p>
  }
  return (
    <>
      {active.length > 0 ? (
        <ul className="admin-mt-catalog__chips" aria-label={zone === 'az' ? 'Активные типы АЗ' : 'Активные типы ПЗ'}>
          {active.map((t) => (
            <li key={t.id}>
              <span className={`admin-mt-chip admin-mt-chip--${zone} admin-mt-chip--active`}>
                <ZoneBadge zone={zone} />
                <span className="admin-mt-chip__code">{t.code}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted admin-mt-catalog__empty">Нет активных типов.</p>
      )}
      {inactive.length > 0 ? (
        <div className="admin-mt-catalog__inactive">
          <span className="muted admin-mt-catalog__inactive-label">Отключённые:</span>
          <ul className="admin-mt-catalog__chips">
            {inactive.map((t) => (
              <li key={t.id}>
                <span className={`admin-mt-chip admin-mt-chip--${zone} admin-mt-chip--inactive`}>
                  <ZoneBadge zone={zone} />
                  <span className="admin-mt-chip__code">{t.code}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

export function AdminMembershipTypes() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''

  const [items, setItems] = useState([])
  const [code, setCode] = useState('')
  const [aerobicCode, setAerobicCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [payDraft, setPayDraft] = useState({})
  const [aerobicPayDraft, setAerobicPayDraft] = useState({})
  const [paySavingId, setPaySavingId] = useState(null)
  const [aerobicPaySavingId, setAerobicPaySavingId] = useState(null)

  const reloadLocal = useCallback(async () => {
    if (!clubId) {
      setItems([])
      return
    }
    setItems(await listMembershipTypesForClub(clubId))
  }, [clubId])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  useEffect(() => {
    const onStorage = () => void reloadLocal()
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [reloadLocal])

  useEffect(() => {
    const draft = {}
    const aerobicDraft = {}
    for (const t of items) {
      const pay = t.trainer_pay_per_session
      draft[t.id] = pay == null || pay === '' ? '' : String(pay)
      const aerobicPay = t.aerobic_pay_amount
      aerobicDraft[t.id] = aerobicPay == null || aerobicPay === '' ? '' : String(aerobicPay)
    }
    setPayDraft(draft)
    setAerobicPayDraft(aerobicDraft)
  }, [items])

  const trainerItems = useMemo(() => filterTrainerAssignableTypes(items), [items])
  const aerobicItems = useMemo(() => filterAerobicSalesTypes(items), [items])

  const savePay = async (typeId) => {
    const id = String(typeId ?? '').trim()
    if (!id) return
    setMsg('')
    setPaySavingId(id)
    try {
      const cloud = await updateMembershipTypePay(id, payDraft[id] ?? '')
      if (!cloud.cloudOk) {
        setMsg(`Ставка сохранена локально, в облако не ушла: ${cloud.cloudError}. Нажмите Sync.`)
      }
      await reloadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения ставки')
    } finally {
      setPaySavingId(null)
    }
  }

  const saveAerobicPay = async (typeId) => {
    const id = String(typeId ?? '').trim()
    if (!id) return
    setMsg('')
    setAerobicPaySavingId(id)
    try {
      const cloud = await updateAerobicMembershipPay(id, aerobicPayDraft[id] ?? '')
      if (!cloud.cloudOk) {
        setMsg(`Стоимость сохранена локально, в облако не ушла: ${cloud.cloudError}. Нажмите Sync.`)
      }
      await reloadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения стоимости')
    } finally {
      setAerobicPaySavingId(null)
    }
  }

  const refreshFromCloud = async () => {
    if (!clubId) return
    setMsg('')
    setPullBusy(true)
    try {
      if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        const r = await pullMembershipTypesForClubFromCloud(clubId, { forceFromCloud: true })
        if (!r.ok && r.error) setMsg(r.error)
      }
      await reloadLocal()
    } finally {
      setPullBusy(false)
    }
  }

  const addType = async (e) => {
    e.preventDefault()
    if (!clubId) {
      setMsg('Выберите клуб в шапке (?club=).')
      return
    }
    const normalized = normalizeMembershipTypeCode(code)
    if (!normalized) {
      setMsg('Введите короткое название типа.')
      return
    }
    const duplicate = items.find(
      (t) => String(t.code ?? '').toLowerCase() === normalized.toLowerCase(),
    )
    if (duplicate) {
      setMsg(
        duplicate.is_active === false
          ? `Тип «${duplicate.code}» уже был — он отключён. Включите снова через повторное добавление или обновите список.`
          : `Тип «${duplicate.code}» уже в списке.`,
      )
      return
    }
    setMsg('')
    setBusy(true)
    try {
      const cloud = await insertMembershipType({ club_id: clubId, code: normalized })
      if (!cloud.cloudOk) {
        setMsg(`Сохранено локально, в облако не ушло: ${cloud.cloudError}. Нажмите Sync.`)
      }
      setCode('')
      await reloadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const addAerobicType = async (e) => {
    e.preventDefault()
    if (!clubId) {
      setMsg('Выберите клуб в шапке (?club=).')
      return
    }
    const normalized = normalizeMembershipTypeCode(aerobicCode)
    if (!normalized) {
      setMsg('Введите короткое название типа.')
      return
    }
    const duplicate = items.find(
      (t) => String(t.code ?? '').toLowerCase() === normalized.toLowerCase(),
    )
    if (duplicate) {
      setMsg(
        duplicate.is_active === false
          ? `Тип «${duplicate.code}» уже был — он отключён.`
          : `Тип «${duplicate.code}» уже в списке.`,
      )
      return
    }
    setMsg('')
    setBusy(true)
    try {
      const cloud = await insertAerobicMembershipType({ club_id: clubId, code: normalized })
      if (!cloud.cloudOk) {
        setMsg(`Сохранено локально, в облако не ушло: ${cloud.cloudError}. Нажмите Sync.`)
      }
      setAerobicCode('')
      await reloadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const runDeactivate = async () => {
    if (!confirmId) return
    setMsg('')
    setBusy(true)
    try {
      const cloud = await deactivateMembershipType(confirmId)
      if (!cloud.cloudOk) {
        setMsg(`Отключено локально, в облако не ушло: ${cloud.cloudError}. Нажмите Sync.`)
      }
      setConfirmId(null)
      await reloadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <p className="muted admin-inline-note" style={{ margin: 0 }}>
        Выберите клуб в шапке — типы абонементов задаются отдельно для каждого клуба.
      </p>
    )
  }

  const trainerCount = splitActiveInactive(trainerItems)
  const aerobicCount = splitActiveInactive(aerobicItems)

  return (
    <div className="admin-membership-types grid" style={{ gap: 16 }}>
      <p className="muted admin-inline-note" style={{ margin: 0 }}>
        <strong>ПЗ</strong> — тренерский зал: тип видит тренер при оформлении абонемента, ставка идёт в ФОТ
        тренеров. <strong>АЗ</strong> — аэробный зал: только отчёт менеджера по продажам и ЗП АЗ, тренер не
        оформляет.
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pullBusy}
          onClick={() => void refreshFromCloud()}
        >
          <RefreshCw size={14} className={pullBusy ? 'icon-spin' : undefined} aria-hidden />
          Обновить с сервера
        </button>
        {msg ? (
          <p className="admin-inline-note" style={{ margin: 0, color: 'var(--danger)' }} role="status">
            {msg}
          </p>
        ) : null}
      </div>

      <section className="admin-mt-catalog" aria-labelledby="admin-mt-overview-title">
        <div className="admin-mt-catalog__head">
          <h3 id="admin-mt-overview-title" className="admin-mt-catalog__title">
            Сводка по залам
          </h3>
          <span className="muted admin-mt-catalog__count">
            ПЗ {trainerCount.active.length}
            {trainerCount.inactive.length ? ` + ${trainerCount.inactive.length} откл.` : ''}
            {' · '}
            АЗ {aerobicCount.active.length}
            {aerobicCount.inactive.length ? ` + ${aerobicCount.inactive.length} откл.` : ''}
          </span>
        </div>
        <div className="admin-mt-overview">
          <div className="admin-mt-overview__col">
            <p className="admin-mt-overview__label">
              <ZoneBadge zone="pz" />
              ПЗ — тренеры
            </p>
            <TypeChips items={trainerItems} zone="pz" emptyLabel="Типов ПЗ пока нет." />
          </div>
          <div className="admin-mt-overview__col">
            <p className="admin-mt-overview__label">
              <ZoneBadge zone="az" />
              АЗ — отчёт продаж
            </p>
            <TypeChips items={aerobicItems} zone="az" emptyLabel="Типов АЗ пока нет." />
          </div>
        </div>
      </section>

      <section className="admin-mt-zone admin-mt-zone--pz" aria-labelledby="admin-mt-pz-title">
        <h3 id="admin-mt-pz-title" className="admin-mt-zone__title">
          <ZoneBadge zone="pz" /> ПЗ — тренерский зал
        </h3>
        <p className="muted admin-mt-zone__lead">
          Тренер выбирает эти типы при создании абонемента. Колонка «Оплата за трен.» — ставка для расчёта ФОТ
          тренеров.
        </p>

        <form onSubmit={addType} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="field" style={{ margin: 0, minWidth: 120, flex: '1 1 140px' }}>
            <label className="label" htmlFor="membership-type-code">
              Новый тип ПЗ
            </label>
            <input
              id="membership-type-code"
              className="input"
              maxLength={12}
              placeholder="Напр. Dm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy || !code.trim()}>
            Добавить тип ПЗ
          </button>
        </form>

        {trainerItems.length > 0 ? (
          <div className="table-wrap admin-mt-table">
            <table>
              <thead>
                <tr>
                  <th className="admin-mt-table__zone">Зал</th>
                  <th>Тип</th>
                  <th>Оплата за трен. (₽)</th>
                  <th>Статус</th>
                  <th style={{ width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {trainerItems.map((t) => (
                  <tr key={t.id} className={t.is_active === false ? 'muted' : undefined}>
                    <td className="admin-mt-table__zone">
                      <ZoneBadge zone="pz" />
                    </td>
                    <td>
                      <strong>{t.code}</strong>
                    </td>
                    <td>
                      <input
                        className="input"
                        type="text"
                        inputMode="decimal"
                        style={{ maxWidth: 120, minWidth: 88 }}
                        aria-label={`Оплата за тренировку ${t.code}`}
                        value={payDraft[t.id] ?? ''}
                        disabled={busy || paySavingId === t.id}
                        onChange={(e) => setPayDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        onBlur={() => void savePay(t.id)}
                      />
                    </td>
                    <td>{t.is_active === false ? 'Отключён' : 'Активен'}</td>
                    <td>
                      {t.is_active !== false ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square"
                          aria-label={`Отключить тип ${t.code}`}
                          title="Отключить"
                          disabled={busy}
                          onClick={() => setConfirmId(t.id)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted admin-mt-catalog__empty">Список ПЗ пуст.</p>
        )}
      </section>

      <section className="admin-mt-zone admin-mt-zone--az" aria-labelledby="admin-mt-az-title">
        <h3 id="admin-mt-az-title" className="admin-mt-zone__title">
          <ZoneBadge zone="az" /> АЗ — аэробный зал
        </h3>
        <p className="muted admin-mt-zone__lead">
          Только для отчёта менеджера по продажам. «Стоимость / ЗП» — сумма зарплаты АЗ за одну продажу этого
          типа. Тренер эти типы не видит.
        </p>

        <form
          onSubmit={addAerobicType}
          className="row"
          style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}
        >
          <div className="field" style={{ margin: 0, minWidth: 120, flex: '1 1 140px' }}>
            <label className="label" htmlFor="aerobic-type-code">
              Новый тип АЗ
            </label>
            <input
              id="aerobic-type-code"
              className="input"
              maxLength={12}
              placeholder="Напр. Бокс"
              value={aerobicCode}
              onChange={(e) => setAerobicCode(e.target.value)}
              disabled={busy}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy || !aerobicCode.trim()}>
            Добавить тип АЗ
          </button>
        </form>

        {aerobicItems.length > 0 ? (
          <div className="table-wrap admin-mt-table">
            <table>
              <thead>
                <tr>
                  <th className="admin-mt-table__zone">Зал</th>
                  <th>Тип</th>
                  <th>Стоимость / ЗП (₽)</th>
                  <th>Статус</th>
                  <th style={{ width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {aerobicItems.map((t) => (
                  <tr key={t.id} className={t.is_active === false ? 'muted' : undefined}>
                    <td className="admin-mt-table__zone">
                      <ZoneBadge zone="az" />
                    </td>
                    <td>
                      <strong>{t.code}</strong>
                    </td>
                    <td>
                      <input
                        className="input"
                        type="text"
                        inputMode="decimal"
                        style={{ maxWidth: 120, minWidth: 88 }}
                        aria-label={`Стоимость ${t.code}`}
                        value={aerobicPayDraft[t.id] ?? ''}
                        disabled={busy || aerobicPaySavingId === t.id}
                        onChange={(e) => setAerobicPayDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        onBlur={() => void saveAerobicPay(t.id)}
                      />
                    </td>
                    <td>{t.is_active === false ? 'Отключён' : 'Активен'}</td>
                    <td>
                      {t.is_active !== false ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square"
                          aria-label={`Отключить тип ${t.code}`}
                          title="Отключить"
                          disabled={busy}
                          onClick={() => setConfirmId(t.id)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted admin-mt-catalog__empty">Список АЗ пуст — добавьте типы выше.</p>
        )}
      </section>

      {confirmId ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setConfirmId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Отключить тип?</h3>
            <p className="muted">
              Новые абонементы с этим типом создать будет нельзя. Уже выданные абонементы сохранят тип.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmId(null)}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runDeactivate()}>
                Отключить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
