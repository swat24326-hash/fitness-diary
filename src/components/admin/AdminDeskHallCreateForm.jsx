import { useEffect, useState } from 'react'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { listClientsByClubId } from '../../lib/localDbClubQuery.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  deskPackageEndIso,
  formatDeskPackageMonthsLabel,
} from '../../lib/admin/deskMembershipLedgerCore.js'
import {
  initialDeskManualCreateForm,
  validateDeskManualCreateForm,
} from '../../lib/admin/deskManualClientCreateCore.js'

/**
 * Форма ручного создания desk-клиента ТЗ или АЗ.
 */
export function AdminDeskHallCreateForm({
  active = false,
  hall = 'tz',
  clubId = '',
  azTypes = [],
  onClose,
  onCreated,
}) {
  const deskHall = hall === 'az' ? 'az' : 'tz'
  const [form, setForm] = useState(() => initialDeskManualCreateForm(deskHall, clubId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!active) return
    setForm(initialDeskManualCreateForm(deskHall, clubId))
    setError('')
    setBusy(false)
  }, [active, deskHall, clubId])

  const setField = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (deskHall === 'tz') {
        if (key === 'package_months' && next.start_date && value) {
          const end = deskPackageEndIso(next.start_date, Number(value))
          if (end) next.end_date = end
        }
        if (key === 'start_date' && next.package_months && value) {
          const end = deskPackageEndIso(value, Number(next.package_months))
          if (end) next.end_date = end
        }
      }
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const clubClients = clubId ? await listClientsByClubId(clubId) : []
      const checked = validateDeskManualCreateForm(
        { ...form, club_id: clubId, hall: deskHall },
        { azTypes, clubClients },
      )
      if (!checked.ok) {
        setError(checked.error)
        return
      }
      const now = new Date().toISOString()
      const clientId = crypto.randomUUID()
      await saveLocalWithSync(
        'clients',
        { id: clientId, ...checked.client, created_at: now },
        { table_name: 'clients', operation: 'insert', remote_id: clientId },
      )
      await saveLocalWithSync(
        'memberships',
        {
          id: crypto.randomUUID(),
          client_id: clientId,
          club_id: checked.client.club_id,
          ...checked.membership,
          created_at: now,
        },
        { table_name: 'memberships', operation: 'insert', remote_id: null },
      )
      try {
        const { ensureOpenHallAfterMembershipSave } = await import(
          '../../lib/clientHallLifecycleSyncService.js'
        )
        await ensureOpenHallAfterMembershipSave(clientId, deskHall)
      } catch (err) {
        console.warn('[desk-create] ensure open hall', err?.message ?? err)
      }
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(
        flush,
        deskHall === 'az' ? 'Новый клиент АЗ' : 'Новый клиент ТЗ',
      )
      if (warn) setError(warn)
      dispatchLocalDataChanged({ reason: 'desk-manual-client-created', clientId, hall: deskHall })
      onCreated?.(clientId, deskHall)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Не удалось создать клиента')
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <>
        <p className="muted" style={{ color: 'var(--danger, #f87171)' }}>
          Сначала выберите клуб в шапке.
        </p>
        <div className="row td-modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
        {deskHall === 'az'
          ? 'Аэробный зал: без тренера, направление и число занятий. Массовая загрузка — «Списки из Excel».'
          : 'Тренажёрный зал: без тренера, абон по сроку. Массовая загрузка — «Списки из Excel».'}
      </p>
      <form className="grid td-modal-form" onSubmit={(e) => void submit(e)} style={{ gap: 12 }}>
        <div className="field">
          <label className="label" htmlFor="desk-create-name">
            ФИО
          </label>
          <input
            id="desk-create-name"
            className="input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="desk-create-phone">
            Телефон
          </label>
          <input
            id="desk-create-phone"
            className="input"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            disabled={busy}
            inputMode="tel"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="desk-create-card">
            № карты
          </label>
          <input
            id="desk-create-card"
            className="input"
            value={form.card_number}
            onChange={(e) => setField('card_number', e.target.value)}
            disabled={busy}
          />
        </div>
        {deskHall === 'az' ? (
          <>
            <div className="field">
              <label className="label" htmlFor="desk-create-az-type">
                Направление
              </label>
              <select
                id="desk-create-az-type"
                className="select"
                value={form.membership_type_id}
                onChange={(e) => setField('membership_type_id', e.target.value)}
                disabled={busy}
                required
              >
                <option value="">Выберите…</option>
                {(azTypes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.code || t.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="desk-create-sessions">
                Занятий
              </label>
              <input
                id="desk-create-sessions"
                className="input"
                value={form.total_trainings}
                onChange={(e) => setField('total_trainings', e.target.value)}
                disabled={busy}
                inputMode="numeric"
                required
              />
            </div>
          </>
        ) : (
          <div className="field">
            <label className="label" htmlFor="desk-create-pkg">
              Пакет
            </label>
            <select
              id="desk-create-pkg"
              className="select"
              value={form.package_months}
              onChange={(e) => setField('package_months', e.target.value)}
              disabled={busy}
            >
              {DESK_PACKAGE_MONTH_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  {formatDeskPackageMonthsLabel(n)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="desk-create-start">
            Начало
          </label>
          <input
            id="desk-create-start"
            type="date"
            className="input"
            value={form.start_date}
            onChange={(e) => setField('start_date', e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="desk-create-end">
            Окончание
          </label>
          <input
            id="desk-create-end"
            type="date"
            className="input"
            value={form.end_date}
            onChange={(e) => setField('end_date', e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="desk-create-paid">
            Оплата, ₽
          </label>
          <input
            id="desk-create-paid"
            className="input"
            value={form.paid_amount}
            onChange={(e) => setField('paid_amount', e.target.value)}
            disabled={busy}
            inputMode="decimal"
            placeholder="необязательно"
          />
        </div>
        {error ? (
          <p className="muted" style={{ color: 'var(--danger, #f87171)', margin: 0 }}>
            {error}
          </p>
        ) : null}
        <div className="row td-modal-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
            {busy ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </form>
    </>
  )
}
