import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  deactivateMembershipType,
  insertMembershipType,
  listMembershipTypesForClub,
  normalizeMembershipTypeCode,
} from '../../lib/membershipTypesService'
import { pullMembershipTypesForClubFromCloud } from '../../lib/pullReferenceData'

export function AdminMembershipTypes() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''

  const [items, setItems] = useState([])
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

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

  const refreshFromCloud = async () => {
    if (!clubId) return
    setMsg('')
    setPullBusy(true)
    try {
      if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        const r = await pullMembershipTypesForClubFromCloud(clubId)
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

  const { activeItems, inactiveItems } = useMemo(() => {
    const active = []
    const inactive = []
    for (const t of items) {
      if (t.is_active === false) inactive.push(t)
      else active.push(t)
    }
    return { activeItems: active, inactiveItems: inactive }
  }, [items])

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

  return (
    <div className="admin-membership-types grid" style={{ gap: 16 }}>
      <p className="muted admin-inline-note" style={{ margin: 0 }}>
        Короткие обозначения типов абонементов для этого клуба. Тренер выбирает тип при создании абонемента.
        Отключённый тип нельзя выбрать в новых абонементах; уже созданные остаются.
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

      <section className="admin-mt-catalog" aria-labelledby="admin-mt-catalog-title">
        <div className="admin-mt-catalog__head">
          <h3 id="admin-mt-catalog-title" className="admin-mt-catalog__title">
            Добавленные типы
          </h3>
          <span className="muted admin-mt-catalog__count">
            {items.length === 0
              ? 'пока нет'
              : `активных ${activeItems.length}${inactiveItems.length ? ` · отключённых ${inactiveItems.length}` : ''}`}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="muted admin-mt-catalog__empty">Список пуст — добавьте типы ниже.</p>
        ) : (
          <>
            {activeItems.length > 0 ? (
              <ul className="admin-mt-catalog__chips" aria-label="Активные типы">
                {activeItems.map((t) => (
                  <li key={t.id}>
                    <span className="admin-mt-chip admin-mt-chip--active">{t.code}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted admin-mt-catalog__empty">Нет активных типов — тренер не сможет выбрать тип в новых абонементах.</p>
            )}
            {inactiveItems.length > 0 ? (
              <div className="admin-mt-catalog__inactive">
                <span className="muted admin-mt-catalog__inactive-label">Отключённые:</span>
                <ul className="admin-mt-catalog__chips" aria-label="Отключённые типы">
                  {inactiveItems.map((t) => (
                    <li key={t.id}>
                      <span className="admin-mt-chip admin-mt-chip--inactive">{t.code}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <form onSubmit={addType} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 120, flex: '1 1 140px' }}>
          <label className="label" htmlFor="membership-type-code">
            Название типа
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
          Добавить
        </button>
      </form>

      {items.length > 0 ? (
        <div className="table-wrap admin-mt-table">
          <p className="muted admin-mt-table__caption">Управление: отключить тип</p>
          <table>
            <thead>
              <tr>
                <th>Тип</th>
                <th>Статус</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className={t.is_active === false ? 'muted' : undefined}>
                  <td>
                    <strong>{t.code}</strong>
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
      ) : null}

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
