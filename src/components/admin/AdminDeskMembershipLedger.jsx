import { useEffect, useMemo, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { saveLocalWithSync } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  deskPackageEndIso,
  formatDeskPackageMonthsLabel,
  inferDeskPackageMonths,
  parseDeskPaidAmountInput,
  pickDeskActiveMembership,
  sortDeskMembershipLedger,
} from '../../lib/admin/deskMembershipLedgerCore.js'

function rowDraftFromMembership(m) {
  const start = m?.start_date ? String(m.start_date).slice(0, 10) : ''
  const end = m?.end_date ? String(m.end_date).slice(0, 10) : ''
  const months = inferDeskPackageMonths(start, end)
  return {
    id: String(m?.id ?? ''),
    package_months: months != null ? String(months) : '',
    start_date: start,
    end_date: end,
    paid_amount: m?.paid_amount != null && m.paid_amount !== '' ? String(m.paid_amount) : '',
  }
}

function PackageSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Пакет по сроку">
      <option value="">—</option>
      {DESK_PACKAGE_MONTH_OPTIONS.map((n) => (
        <option key={n} value={String(n)}>
          {formatDeskPackageMonthsLabel(n)}
        </option>
      ))}
      {value && !DESK_PACKAGE_MONTH_OPTIONS.includes(Number(value)) ? (
        <option value={value}>{formatDeskPackageMonthsLabel(Number(value))}</option>
      ) : null}
    </select>
  )
}

/**
 * История абонов desk ТЗ/АЗ — карточки в стиле Оси.
 */
export function AdminDeskMembershipLedger({ client, memberships = [], clubId = '', onChanged }) {
  const today = todayLocalIso()
  const active = useMemo(() => pickDeskActiveMembership(memberships, today), [memberships, today])
  const activeId = active?.id ? String(active.id) : null
  const sorted = useMemo(() => sortDeskMembershipLedger(memberships), [memberships])

  const [drafts, setDrafts] = useState(() => ({}))
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({
    package_months: '1',
    start_date: today,
    end_date: deskPackageEndIso(today, 1),
    paid_amount: '',
  })

  useEffect(() => {
    const next = {}
    for (const m of sorted) {
      next[String(m.id)] = rowDraftFromMembership(m)
    }
    setDrafts(next)
  }, [sorted])

  const setDraftField = (id, key, value) => {
    setDrafts((prev) => {
      const cur = { ...prev[id] }
      cur[key] = value
      if (key === 'package_months' && cur.start_date && value) {
        const end = deskPackageEndIso(cur.start_date, Number(value))
        if (end) cur.end_date = end
      }
      if (key === 'start_date' && cur.package_months && value) {
        const end = deskPackageEndIso(value, Number(cur.package_months))
        if (end) cur.end_date = end
      }
      if (key === 'end_date' || key === 'start_date') {
        const inferred = inferDeskPackageMonths(cur.start_date, cur.end_date)
        if (inferred != null) cur.package_months = String(inferred)
      }
      return { ...prev, [id]: cur }
    })
  }

  const setNewField = (key, value) => {
    setNewRow((r) => {
      const cur = { ...r, [key]: value }
      if (key === 'package_months' && cur.start_date && value) {
        const end = deskPackageEndIso(cur.start_date, Number(value))
        if (end) cur.end_date = end
      }
      if (key === 'start_date' && cur.package_months && value) {
        const end = deskPackageEndIso(value, Number(cur.package_months))
        if (end) cur.end_date = end
      }
      if (key === 'end_date' || key === 'start_date') {
        const inferred = inferDeskPackageMonths(cur.start_date, cur.end_date)
        if (inferred != null) cur.package_months = String(inferred)
      }
      return cur
    })
  }

  const saveRow = async (m) => {
    const id = String(m.id)
    const d = drafts[id] || rowDraftFromMembership(m)
    if (!d.start_date || !d.end_date) {
      setError('Укажите даты начала и окончания')
      return
    }
    if (d.end_date < d.start_date) {
      setError('Окончание не может быть раньше начала')
      return
    }
    const paid = parseDeskPaidAmountInput(d.paid_amount)
    if (d.paid_amount !== '' && paid == null) {
      setError('Цена должна быть числом ≥ 0')
      return
    }
    setBusyId(id)
    setError('')
    try {
      const row = {
        ...m,
        membership_type_id: null,
        start_date: d.start_date,
        end_date: d.end_date,
        paid_amount: paid,
      }
      await saveLocalWithSync('memberships', row, {
        table_name: 'memberships',
        operation: 'update',
        remote_id: id,
      })
      dispatchLocalDataChanged({ reason: 'desk-membership-ledger' })
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить абон')
    } finally {
      setBusyId('')
    }
  }

  const addRow = async () => {
    if (!client?.id) return
    if (!newRow.start_date || !newRow.end_date) {
      setError('Для нового абона укажите даты')
      return
    }
    if (newRow.end_date < newRow.start_date) {
      setError('Окончание не может быть раньше начала')
      return
    }
    const paid = parseDeskPaidAmountInput(newRow.paid_amount)
    if (newRow.paid_amount !== '' && paid == null) {
      setError('Цена должна быть числом ≥ 0')
      return
    }
    setBusyId('new')
    setError('')
    try {
      const now = new Date().toISOString()
      const row = {
        id: crypto.randomUUID(),
        client_id: client.id,
        club_id: String(clubId || client.club_id || ''),
        membership_type_id: null,
        start_date: newRow.start_date,
        end_date: newRow.end_date,
        paid_amount: paid,
        total_trainings: 0,
        used_trainings: 0,
        created_at: now,
      }
      await saveLocalWithSync('memberships', row, {
        table_name: 'memberships',
        operation: 'insert',
        remote_id: null,
      })
      setAdding(false)
      setNewRow({
        package_months: '1',
        start_date: today,
        end_date: deskPackageEndIso(today, 1),
        paid_amount: '',
      })
      dispatchLocalDataChanged({ reason: 'desk-membership-ledger' })
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Не удалось добавить абон')
    } finally {
      setBusyId('')
    }
  }

  const renderFields = (d, onField) => (
    <div className="admin-desk-mem-card__fields">
      <label>
        Пакет
        <PackageSelect value={d.package_months} onChange={(v) => onField('package_months', v)} />
      </label>
      <label>
        Начало
        <input type="date" value={d.start_date} onChange={(e) => onField('start_date', e.target.value)} />
      </label>
      <label>
        Конец
        <input type="date" value={d.end_date} onChange={(e) => onField('end_date', e.target.value)} />
      </label>
      <label>
        Цена ₽
        <input
          type="text"
          inputMode="decimal"
          value={d.paid_amount}
          onChange={(e) => onField('paid_amount', e.target.value)}
          placeholder="—"
        />
      </label>
    </div>
  )

  return (
    <section className="admin-desk-membership-ledger" aria-label="Абонементы для учёта">
      <h3 className="admin-section-title">Абонементы</h3>
      <p className="admin-desk-membership-ledger__hint">
        Пакет — срок из прайса ТЗ/АЗ (1 месяц, 2…). «Действующий» — по датам на сегодня, не по лимиту
        тренировок.
      </p>
      {error ? <p className="sales-report__error">{error}</p> : null}

      {!sorted.length && !adding ? (
        <p className="muted">Абонов пока нет — добавьте вручную или загрузите список из Excel.</p>
      ) : (
        <div className="admin-desk-membership-ledger__list">
          {sorted.map((m) => {
            const id = String(m.id)
            const d = drafts[id] || rowDraftFromMembership(m)
            const kind = deskMembershipLedgerKind(m, today, activeId)
            return (
              <article
                key={id}
                className={`admin-desk-mem-card${kind === 'active' ? ' admin-desk-mem-card--active' : ''}`}
              >
                <div className="admin-desk-mem-card__head">
                  <span className={`admin-desk-mem-card__kind admin-desk-mem-card__kind--${kind}`}>
                    {deskMembershipLedgerKindLabel(kind)}
                  </span>
                </div>
                {renderFields(d, (key, value) => setDraftField(id, key, value))}
                <div className="admin-desk-mem-card__foot">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busyId)}
                    onClick={() => void saveRow(m)}
                  >
                    <Save size={16} aria-hidden /> {busyId === id ? 'Сохраняю…' : 'Сохранить абон'}
                  </button>
                </div>
              </article>
            )
          })}

          {adding ? (
            <article className="admin-desk-mem-card admin-desk-mem-card--active">
              <div className="admin-desk-mem-card__head">
                <span className="admin-desk-mem-card__kind">новый</span>
              </div>
              {renderFields(newRow, setNewField)}
              <div className="admin-desk-mem-card__foot">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={Boolean(busyId)}
                  onClick={() => void addRow()}
                >
                  {busyId === 'new' ? 'Добавляю…' : 'Добавить'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busyId)} onClick={() => setAdding(false)}>
                  Отмена
                </button>
              </div>
            </article>
          ) : null}
        </div>
      )}

      <div className="admin-desk-membership-ledger__toolbar">
        {!adding ? (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden /> Добавить абон
          </button>
        ) : null}
      </div>
    </section>
  )
}
