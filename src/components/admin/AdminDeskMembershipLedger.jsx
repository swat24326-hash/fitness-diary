import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { normalizeDeskHall } from '../../lib/admin/deskHallClientsCore.js'
import { ensureMembershipTypesForClub } from '../../lib/membershipTypesService.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  applyDeskMembershipDraftField,
  deskMembershipDraftEquals,
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  deskMembershipRowDraft,
  deskMembershipsContentSig,
  deskPackageEndIso,
  formatDeskPackageMonthsLabel,
  parseDeskPaidAmountInput,
  parseDeskTotalTrainingsInput,
  pickHallActiveMembership,
  sortDeskMembershipLedger,
} from '../../lib/admin/deskMembershipLedgerCore.js'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'

function PackageSelect({ value, onChange }) {
  return (
    <select
      className="admin-desk-mem-card__select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Пакет по сроку"
    >
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
 * Для АЗ — ещё направление (Бокс / Техника дня… из типов абон. АЗ).
 */
export function AdminDeskMembershipLedger({ client, memberships = [], clubId = '', onChanged }) {
  const today = todayLocalIso()
  const hall = normalizeDeskHall(client?.desk_hall)
  const showAzDirection = hall === 'az'
  const active = useMemo(
    () => pickHallActiveMembership(memberships, today, hall),
    [memberships, today, hall],
  )
  const activeId = active?.id ? String(active.id) : null
  const membershipsSig = useMemo(() => deskMembershipsContentSig(memberships), [memberships])
  const membershipsRef = useRef(memberships)
  membershipsRef.current = memberships
  const sorted = useMemo(() => sortDeskMembershipLedger(membershipsRef.current), [membershipsSig])

  const [azTypes, setAzTypes] = useState([])
  const [drafts, setDrafts] = useState(() => ({}))
  /** Не затирать поля, которые пользователь уже правил, при reload memberships. */
  const dirtyIdsRef = useRef(new Set())
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({
    package_months: '1',
    start_date: today,
    end_date: deskPackageEndIso(today, 1),
    paid_amount: '',
    membership_type_id: '',
    total_trainings: '',
  })

  useEffect(() => {
    let alive = true
    if (!showAzDirection || !clubId) {
      setAzTypes([])
      return undefined
    }
    void ensureMembershipTypesForClub(clubId, { aerobicOnly: true, activeOnly: true })
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res?.types) ? res.types : []
        setAzTypes(list)
      })
      .catch(() => {
        if (alive) setAzTypes([])
      })
    return () => {
      alive = false
    }
  }, [showAzDirection, clubId])

  useEffect(() => {
    setDrafts((prev) => {
      const next = {}
      const alive = new Set()
      for (const m of sorted) {
        const id = String(m.id)
        alive.add(id)
        const fromMem = deskMembershipRowDraft(m)
        if (dirtyIdsRef.current.has(id) && prev[id]) {
          if (deskMembershipDraftEquals(prev[id], fromMem)) {
            dirtyIdsRef.current.delete(id)
            next[id] = fromMem
          } else {
            next[id] = prev[id]
          }
        } else {
          next[id] = fromMem
        }
      }
      for (const id of dirtyIdsRef.current) {
        if (!alive.has(id)) dirtyIdsRef.current.delete(id)
      }
      return next
    })
  }, [sorted])

  const setDraftField = (id, key, value) => {
    dirtyIdsRef.current.add(id)
    setDrafts((prev) => {
      const cur = prev[id] || deskMembershipRowDraft({ id })
      return { ...prev, [id]: applyDeskMembershipDraftField(cur, key, value) }
    })
  }

  const setNewField = (key, value) => {
    setNewRow((r) => applyDeskMembershipDraftField(r, key, value))
  }

  const resolveTypeId = (draftTypeId) => {
    const id = String(draftTypeId ?? '').trim()
    return id || null
  }

  const saveRow = async (m) => {
    const id = String(m.id)
    const d = drafts[id] || deskMembershipRowDraft(m)
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
    let sessions = null
    if (showAzDirection) {
      sessions = parseDeskTotalTrainingsInput(d.total_trainings)
      if (d.total_trainings !== '' && sessions == null) {
        setError('Кол-во занятий — целое число ≥ 0')
        return
      }
    }
    setBusyId(id)
    setError('')
    try {
      const club = String(m.club_id || clubId || client?.club_id || '').trim()
      const row = {
        ...m,
        club_id: club || m.club_id || null,
        start_date: d.start_date,
        end_date: d.end_date,
        paid_amount: paid,
      }
      // АЗ: направление + кол-во занятий. ТЗ: пакет по сроку, без лимита занятий.
      if (showAzDirection) {
        row.membership_type_id = resolveTypeId(d.membership_type_id)
        row.total_trainings = sessions ?? 0
      }
      await saveLocalWithSync('memberships', row, {
        table_name: 'memberships',
        operation: 'update',
        remote_id: id,
      })
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Абонемент')
      if (warn) setError(warn)
      // Держим dirty, пока reload/hydrate не подтвердит те же даты — иначе облако может откатить UI.
      const savedDraft = deskMembershipRowDraft(row)
      dirtyIdsRef.current.add(id)
      setDrafts((prev) => ({ ...prev, [id]: savedDraft }))
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
    let sessions = 0
    if (showAzDirection) {
      const parsed = parseDeskTotalTrainingsInput(newRow.total_trainings)
      if (newRow.total_trainings !== '' && parsed == null) {
        setError('Кол-во занятий — целое число ≥ 0')
        return
      }
      sessions = parsed ?? 0
    }
    setBusyId('new')
    setError('')
    try {
      const now = new Date().toISOString()
      const row = {
        id: crypto.randomUUID(),
        client_id: client.id,
        club_id: String(clubId || client.club_id || ''),
        membership_type_id: showAzDirection ? resolveTypeId(newRow.membership_type_id) : null,
        start_date: newRow.start_date,
        end_date: newRow.end_date,
        paid_amount: paid,
        total_trainings: sessions,
        used_trainings: 0,
        created_at: now,
      }
      await saveLocalWithSync('memberships', row, {
        table_name: 'memberships',
        operation: 'insert',
        remote_id: null,
      })
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Абонемент')
      if (warn) setError(warn)
      setAdding(false)
      setNewRow({
        package_months: '1',
        start_date: today,
        end_date: deskPackageEndIso(today, 1),
        paid_amount: '',
        membership_type_id: '',
        total_trainings: '',
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
      {showAzDirection ? (
        <label>
          Направление
          <select
            className="admin-desk-mem-card__select"
            value={d.membership_type_id || ''}
            onChange={(e) => onField('membership_type_id', e.target.value)}
            aria-label="Направление АЗ"
          >
            <option value="">—</option>
            {azTypes.map((t) => {
              const label = String(t?.name ?? '').trim() || String(t?.code ?? '').trim() || 'Без названия'
              return (
                <option key={t.id} value={String(t.id)}>
                  {label}
                </option>
              )
            })}
            {d.membership_type_id &&
            !azTypes.some((t) => String(t.id) === String(d.membership_type_id)) ? (
              <option value={String(d.membership_type_id)}>Сохранённый тип</option>
            ) : null}
          </select>
        </label>
      ) : null}
      {showAzDirection ? null : (
        <label>
          Пакет
          <PackageSelect value={d.package_months} onChange={(v) => onField('package_months', v)} />
        </label>
      )}
      <label>
        Начало
        <AdminDeskMemDateField
          value={d.start_date}
          onChange={(v) => onField('start_date', v)}
          aria-label="Дата начала"
        />
      </label>
      <label>
        Конец
        <AdminDeskMemDateField
          value={d.end_date}
          onChange={(v) => onField('end_date', v)}
          aria-label="Дата окончания"
        />
      </label>
      {showAzDirection ? (
        <label>
          Занятий
          <input
            type="text"
            inputMode="numeric"
            value={d.total_trainings ?? ''}
            onChange={(e) => onField('total_trainings', e.target.value)}
            placeholder="шт"
            aria-label="Количество занятий"
          />
        </label>
      ) : null}
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
        {showAzDirection
          ? 'АЗ: направление, сроки и кол-во занятий. «Действующий» — по датам на сегодня. Даты — дд.мм.гггг или календарь. Направление — из Структура → Типы абон. → АЗ.'
          : 'Пакет — срок из прайса (1 месяц, 2…). «Действующий» — по датам на сегодня. Даты — дд.мм.гггг или календарь.'}
      </p>
      {showAzDirection && !azTypes.length ? (
        <p className="muted admin-desk-membership-ledger__hint">
          Типов АЗ пока нет — добавьте «Бокс», «Техника дня» и др. в Структура → Типы абон.
        </p>
      ) : null}
      {error ? <p className="sales-report__error">{error}</p> : null}

      {!sorted.length && !adding ? (
        <p className="muted">Абонов пока нет — добавьте вручную или загрузите список из Excel.</p>
      ) : (
        <div className="admin-desk-membership-ledger__list">
          {sorted.map((m) => {
            const id = String(m.id)
            const d = drafts[id] || deskMembershipRowDraft(m)
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
