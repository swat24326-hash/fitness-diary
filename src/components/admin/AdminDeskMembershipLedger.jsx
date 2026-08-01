import { useEffect, useMemo, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { saveLocalWithSync } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import {
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  parseDeskPaidAmountInput,
  pickDeskActiveMembership,
  sortDeskMembershipLedger,
} from '../../lib/admin/deskMembershipLedgerCore.js'

function rowDraftFromMembership(m) {
  return {
    id: String(m?.id ?? ''),
    membership_type_id: String(m?.membership_type_id ?? ''),
    start_date: m?.start_date ? String(m.start_date).slice(0, 10) : '',
    end_date: m?.end_date ? String(m.end_date).slice(0, 10) : '',
    paid_amount: m?.paid_amount != null && m.paid_amount !== '' ? String(m.paid_amount) : '',
  }
}

/**
 * История абонов на desk ТЗ/АЗ: тип, даты, цена, действующий.
 * @param {{
 *   client: object,
 *   memberships?: object[],
 *   clubId?: string,
 *   onChanged?: () => void,
 * }} props
 */
export function AdminDeskMembershipLedger({ client, memberships = [], clubId = '', onChanged }) {
  const today = todayLocalIso()
  const active = useMemo(() => pickDeskActiveMembership(memberships, today), [memberships, today])
  const activeId = active?.id ? String(active.id) : null
  const sorted = useMemo(() => sortDeskMembershipLedger(memberships), [memberships])

  const [types, setTypes] = useState([])
  const [drafts, setDrafts] = useState(() => ({}))
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({
    membership_type_id: '',
    start_date: today,
    end_date: '',
    paid_amount: '',
  })

  useEffect(() => {
    const next = {}
    for (const m of sorted) {
      next[String(m.id)] = rowDraftFromMembership(m)
    }
    setDrafts(next)
  }, [sorted])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cid = String(clubId || client?.club_id || '')
        if (!cid) {
          if (!cancelled) setTypes([])
          return
        }
        const list = await listMembershipTypesForClub(cid)
        if (!cancelled) setTypes(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setTypes([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, client?.club_id])

  const setDraftField = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }))
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
        membership_type_id: d.membership_type_id || null,
        start_date: d.start_date,
        end_date: d.end_date,
        paid_amount: paid,
        updated_at: new Date().toISOString(),
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
        membership_type_id: newRow.membership_type_id || null,
        start_date: newRow.start_date,
        end_date: newRow.end_date,
        paid_amount: paid,
        total_trainings: 0,
        used_trainings: 0,
        created_at: now,
        updated_at: now,
      }
      await saveLocalWithSync('memberships', row, {
        table_name: 'memberships',
        operation: 'insert',
        remote_id: null,
      })
      setAdding(false)
      setNewRow({ membership_type_id: '', start_date: today, end_date: '', paid_amount: '' })
      dispatchLocalDataChanged({ reason: 'desk-membership-ledger' })
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Не удалось добавить абон')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="admin-desk-membership-ledger" aria-label="Абонементы для учёта">
      <h3 className="admin-section-title">Абонементы</h3>
      <p className="muted" style={{ marginBottom: '0.75rem' }}>
        История покупок: тип, период, цена. «Действующий» — по датам на сегодня (для стратегии и учёта).
      </p>
      {error ? <p className="sales-report__error">{error}</p> : null}
      {!sorted.length && !adding ? (
        <p className="muted">Абонов пока нет — добавьте вручную или загрузите закрытия Excel.</p>
      ) : (
        <div className="sales-payments-import__table-wrap">
          <table className="sales-payments-import__table admin-desk-membership-ledger__table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Тип</th>
                <th>Начало</th>
                <th>Конец</th>
                <th>Цена ₽</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const id = String(m.id)
                const d = drafts[id] || rowDraftFromMembership(m)
                const kind = deskMembershipLedgerKind(m, today, activeId)
                return (
                  <tr key={id} className={kind === 'active' ? 'admin-desk-membership-ledger__row--active' : undefined}>
                    <td>
                      <span className={`admin-desk-membership-ledger__kind admin-desk-membership-ledger__kind--${kind}`}>
                        {deskMembershipLedgerKindLabel(kind)}
                      </span>
                    </td>
                    <td>
                      <select
                        value={d.membership_type_id}
                        onChange={(e) => setDraftField(id, 'membership_type_id', e.target.value)}
                      >
                        <option value="">—</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code || t.name || t.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={d.start_date}
                        onChange={(e) => setDraftField(id, 'start_date', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={d.end_date}
                        onChange={(e) => setDraftField(id, 'end_date', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={d.paid_amount}
                        onChange={(e) => setDraftField(id, 'paid_amount', e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-xs"
                        disabled={Boolean(busyId)}
                        onClick={() => void saveRow(m)}
                      >
                        <Save size={14} aria-hidden /> {busyId === id ? '…' : 'Сохранить'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {adding ? (
                <tr>
                  <td>
                    <span className="muted">новый</span>
                  </td>
                  <td>
                    <select
                      value={newRow.membership_type_id}
                      onChange={(e) => setNewRow((r) => ({ ...r, membership_type_id: e.target.value }))}
                    >
                      <option value="">—</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code || t.name || t.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newRow.start_date}
                      onChange={(e) => setNewRow((r) => ({ ...r, start_date: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newRow.end_date}
                      onChange={(e) => setNewRow((r) => ({ ...r, end_date: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newRow.paid_amount}
                      onChange={(e) => setNewRow((r) => ({ ...r, paid_amount: e.target.value }))}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button type="button" className="btn btn-xs btn-primary" disabled={Boolean(busyId)} onClick={() => void addRow()}>
                      {busyId === 'new' ? '…' : 'Добавить'}
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {!adding ? (
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> Добавить абон
        </button>
      ) : (
        <button type="button" className="btn btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setAdding(false)}>
          Отмена
        </button>
      )}
    </section>
  )
}
