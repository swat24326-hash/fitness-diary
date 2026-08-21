import { useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { listClientsByClubId } from '../../lib/localDbClubQuery.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  deskPackageEndIso,
  formatDeskPackageMonthsLabel,
} from '../../lib/admin/deskMembershipLedgerCore.js'
import {
  listNoTabletTrainersForClub,
  validateLitePzCreateForm,
} from '../../lib/admin/litePzClientCreateCore.js'

const initialForm = (clubId) => ({
  name: '',
  phone: '',
  card_number: '',
  trainer_id: '',
  club_id: clubId || '',
  package_months: '1',
  start_date: todayLocalIso(),
  end_date: deskPackageEndIso(todayLocalIso(), 1) || '',
  paid_amount: '',
})

/**
 * Форма lite-ПЗ (без overlay) — для оболочки «Новый клиент» с выбором зала.
 */
export function AdminLitePzCreateForm({
  active = false,
  clubId = '',
  trainers = [],
  onClose,
  onCreated,
  showLead = true,
}) {
  const [form, setForm] = useState(() => initialForm(clubId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const noTabletTrainers = useMemo(
    () => listNoTabletTrainersForClub(trainers, clubId),
    [trainers, clubId],
  )

  useEffect(() => {
    if (!active) return
    const base = initialForm(clubId)
    const list = listNoTabletTrainersForClub(trainers, clubId)
    if (list.length === 1) base.trainer_id = list[0].id
    setForm(base)
    setError('')
    setBusy(false)
  }, [active, clubId, trainers])

  const setField = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'package_months' && next.start_date && value) {
        const end = deskPackageEndIso(next.start_date, Number(value))
        if (end) next.end_date = end
      }
      if (key === 'start_date' && next.package_months && value) {
        const end = deskPackageEndIso(value, Number(next.package_months))
        if (end) next.end_date = end
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
      const checked = validateLitePzCreateForm({ ...form, club_id: clubId }, noTabletTrainers, clubClients)
      if (!checked.ok) {
        setError(checked.error)
        return
      }
      const now = new Date().toISOString()
      const clientId = crypto.randomUUID()
      const clientRow = {
        id: clientId,
        ...checked.client,
        created_at: now,
      }
      await saveLocalWithSync('clients', clientRow, {
        table_name: 'clients',
        operation: 'insert',
        remote_id: clientId,
      })
      const memId = crypto.randomUUID()
      await saveLocalWithSync(
        'memberships',
        {
          id: memId,
          client_id: clientId,
          club_id: checked.client.club_id,
          membership_type_id: null,
          ...checked.membership,
          created_at: now,
        },
        {
          table_name: 'memberships',
          operation: 'insert',
          remote_id: null,
        },
      )
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Новый клиент ПЗ')
      if (warn) setError(warn)
      dispatchLocalDataChanged({ reason: 'lite-pz-client-created', clientId })
      onCreated?.(clientId)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Не удалось создать клиента')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {showLead ? (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Для тренера <strong>без планшета</strong>: ФИО, карта, абон и оплата. Когда выдадите планшет — в Организации
          снимите галку «Без планшета»: карточка станет полным дневником, пересоздавать не нужно.
        </p>
      ) : null}
      {!clubId ? (
        <p className="muted" style={{ color: 'var(--danger, #f87171)' }}>
          Сначала выберите клуб в шапке.
        </p>
      ) : noTabletTrainers.length === 0 ? (
        <p className="muted">
          В этом клубе нет тренеров с галкой «Без планшета». Отметьте её в{' '}
          <a href={`/admin/organization${clubId ? `?club=${encodeURIComponent(clubId)}` : ''}`}>Организации</a>
          , затем вернитесь сюда.
        </p>
      ) : (
        <form className="grid td-modal-form" onSubmit={(e) => void submit(e)} style={{ gap: 12 }}>
          <div className="field">
            <label className="label" htmlFor="lite-pz-trainer">
              Тренер
            </label>
            <select
              id="lite-pz-trainer"
              className="select"
              value={form.trainer_id}
              onChange={(e) => setField('trainer_id', e.target.value)}
              disabled={busy}
              required
            >
              <option value="">Выберите…</option>
              {noTabletTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-name">
              ФИО
            </label>
            <input
              id="lite-pz-name"
              className="input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-phone">
              Телефон
            </label>
            <input
              id="lite-pz-phone"
              className="input"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              disabled={busy}
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-card">
              № карты
            </label>
            <input
              id="lite-pz-card"
              className="input"
              value={form.card_number}
              onChange={(e) => setField('card_number', e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-pkg">
              Пакет
            </label>
            <select
              id="lite-pz-pkg"
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
          <div className="field">
            <label className="label" htmlFor="lite-pz-start">
              Начало
            </label>
            <input
              id="lite-pz-start"
              type="date"
              className="input"
              value={form.start_date}
              onChange={(e) => setField('start_date', e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-end">
              Окончание
            </label>
            <input
              id="lite-pz-end"
              type="date"
              className="input"
              value={form.end_date}
              onChange={(e) => setField('end_date', e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="lite-pz-paid">
              Оплата, ₽
            </label>
            <input
              id="lite-pz-paid"
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
      )}
      {clubId && noTabletTrainers.length === 0 ? (
        <div className="row td-modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose}>
            Закрыть
          </button>
        </div>
      ) : null}
      {!clubId ? (
        <div className="row td-modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose}>
            Закрыть
          </button>
        </div>
      ) : null}
    </>
  )
}

/**
 * Модалка: админ создаёт lite-клиента ПЗ на тренера без планшета.
 */
export function AdminLitePzCreateModal({
  open,
  clubId = '',
  trainers = [],
  onClose,
  onCreated,
}) {
  if (!open) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lite-pz-create-title"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 id="lite-pz-create-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
          <UserPlus size={20} aria-hidden style={{ verticalAlign: -3, marginRight: 8 }} />
          Новый клиент ПЗ
        </h2>
        <AdminLitePzCreateForm
          active={open}
          clubId={clubId}
          trainers={trainers}
          onClose={onClose}
          onCreated={onCreated}
          showLead
        />
      </div>
    </div>
  )
}
