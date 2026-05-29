import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listMemberships, listTrainingsForClient } from '../lib/dataAccess'
import { getDb } from '../lib/localDb'
import { deleteLocalWithSync, saveLocalWithSync } from '../lib/syncService'
import { addDaysToIso, formatDateRu, formatDateTimeRu, todayLocalIso } from '../lib/dateRu'
import { listMembershipTypesForClub, membershipTypeCode } from '../lib/membershipTypesService'
import { CheckCircle2, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function newId() {
  return crypto.randomUUID()
}

function membershipDateWindowOk(m, todayIso) {
  const s = m?.start_date
  const e = m?.end_date
  if (!s || !e) return false
  return String(s) <= String(todayIso) && String(e) >= String(todayIso)
}

function membershipRemainingOk(m) {
  const total = Number(m?.total_trainings ?? 0)
  const used = Number(m?.used_trainings ?? 0)
  return Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
}

function membershipVisualKind(m, todayIso) {
  const windowOk = membershipDateWindowOk(m, todayIso)
  const remainingOk = membershipRemainingOk(m)
  if (windowOk && remainingOk) return 'active'
  if (windowOk && !remainingOk) return 'depleted'
  return 'no_window'
}

function membershipVisualMeta(kind) {
  if (kind === 'active') {
    return {
      label: 'Действует',
      title: 'Действует: срок активен и есть остаток тренировок',
    }
  }
  if (kind === 'depleted') {
    return {
      label: 'Тренировки закончились',
      title: 'Тренировки закончились: по сроку ещё можно, но лимит исчерпан',
    }
  }
  return {
    label: 'Нет действующего срока',
    title: 'Нет действующего срока: даты не заданы, ещё не начался или уже истёк',
  }
}

function MembershipStatusIcon({ kind }) {
  const meta = membershipVisualMeta(kind)
  const common = { role: 'img', 'aria-label': meta.label, title: meta.title }
  if (kind === 'active') {
    return (
      <svg {...common} width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="6" fill="#22c55e" />
      </svg>
    )
  }
  if (kind === 'depleted') {
    return (
      <svg {...common} width="18" height="18" viewBox="0 0 18 18">
        <rect x="4" y="4" width="10" height="10" rx="2" fill="#ef4444" />
      </svg>
    )
  }
  return (
    <svg {...common} width="18" height="18" viewBox="0 0 18 18">
      <path d="M9 3.5 L15.5 14.5 H2.5 Z" fill="#ef4444" />
    </svg>
  )
}

export function MembershipManager({ clientId, clubId, recordTrainerId, onChanged }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({ start_date: '', end_date: '', total_trainings: 12, membership_type_id: '' })
  const [edit, setEdit] = useState({ start_date: '', end_date: '', total_trainings: 0, membership_type_id: '' })
  const [editOpenId, setEditOpenId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [membershipTypes, setMembershipTypes] = useState([])
  const [trainings, setTrainings] = useState([])
  const [viewOpenId, setViewOpenId] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null) // { t, membership }

  const todayIso = useMemo(() => todayLocalIso(), [])

  const reloadTypes = useCallback(async () => {
    if (!clubId) {
      setMembershipTypes([])
      return
    }
    setMembershipTypes(await listMembershipTypesForClub(clubId))
  }, [clubId])

  useEffect(() => {
    void reloadTypes()
  }, [reloadTypes])

  useEffect(() => {
    const onStorage = () => void reloadTypes()
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [reloadTypes])

  const typesById = useMemo(() => new Map(membershipTypes.map((t) => [t.id, t])), [membershipTypes])

  const typeOptionsForSelect = useCallback(
    (selectedTypeId) => {
      const sid = String(selectedTypeId ?? '').trim()
      const active = membershipTypes.filter((t) => t.is_active !== false)
      if (!sid) return active
      const cur = membershipTypes.find((t) => String(t.id) === sid)
      if (cur && cur.is_active === false && !active.some((t) => t.id === cur.id)) {
        return [...active, cur]
      }
      return active
    },
    [membershipTypes],
  )

  const formatTypeCell = useCallback(
    (typeId) => {
      const code = membershipTypeCode(typesById, typeId)
      return code || '—'
    },
    [typesById],
  )

  const computeMembershipTrainings = useCallback(
    (m, allTrainings) => {
      if (!m?.id) return []
      const s = String(m.start_date ?? '')
      const e = String(m.end_date ?? '')
      const listSrc = Array.isArray(allTrainings) ? allTrainings : []

      const byId = listSrc.filter((t) => t?.status === 'completed' && t?.data?.membership_id === m.id)
      const hasAnyById = byId.length > 0

      const legacyByRange = listSrc.filter((t) => {
        if (t?.status !== 'completed') return false
        const mid = t?.data?.membership_id
        if (mid) return false
        const d = String(t?.date ?? '').slice(0, 10)
        if (!d || !s || !e) return false
        return d >= s && d <= e
      })

      const list = hasAnyById
        ? [...byId, ...legacyByRange]
        : listSrc.filter((t) => {
            if (t?.status !== 'completed') return false
            const mid = t?.data?.membership_id
            if (mid && mid !== m.id) return false
            const d = String(t?.date ?? '').slice(0, 10)
            if (!d || !s || !e) return false
            return d >= s && d <= e
          })

      // uniq by id
      const seen = new Set()
      const out = []
      for (const t of list) {
        if (!t?.id || seen.has(t.id)) continue
        seen.add(t.id)
        out.push(t)
      }

      out.sort((a, b) => {
        const da = String(a?.date ?? '').slice(0, 10)
        const db = String(b?.date ?? '').slice(0, 10)
        if (da !== db) return da.localeCompare(db)
        return String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''))
      })
      return out
    },
    [],
  )

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const reload = useCallback(async () => {
    const [m0, t0] = await Promise.all([listMemberships(clientId), listTrainingsForClient(clientId)])
    setTrainings(t0)

    // reconcile used_trainings by фактическим завершённым тренировкам абонемента
    const next = []
    for (const m of m0) {
      const usedComputed = computeMembershipTrainings(m, t0).length
      const usedStored = Number(m?.used_trainings ?? 0)
      if (Number.isFinite(usedComputed) && usedComputed >= 0 && usedComputed !== usedStored) {
        const patched = { ...m, used_trainings: usedComputed }
        next.push(patched)
        try {
          await saveLocalWithSync('memberships', patched, { table_name: 'memberships', operation: 'update', remote_id: patched.id })
        } catch {
          // если не удалось — всё равно покажем рассчитанное в UI, чтобы значения не расходились
        }
      } else {
        next.push(m)
      }
    }

    setItems(next)
    setSelectedId((cur) => cur ?? (next[0]?.id ?? null))
    if (next.some((m, i) => Number(m?.used_trainings ?? 0) !== Number(m0[i]?.used_trainings ?? 0))) {
      onChangedRef.current?.()
    }
  }, [clientId, computeMembershipTrainings])

  useEffect(() => {
    reload()
  }, [reload])

  const notify = async () => {
    await reload()
    onChanged?.()
  }

  const addMembership = async (e) => {
    e.preventDefault()
    if (!clubId) {
      alert('У клиента не указан club_id')
      return
    }
    const id = newId()
    const now = new Date().toISOString()
    const today = todayLocalIso()
    const row = {
      id,
      client_id: clientId,
      club_id: clubId,
      start_date: form.start_date || today,
      end_date: form.end_date || addDaysToIso(today, 30),
      total_trainings: Number(form.total_trainings) || 0,
      used_trainings: 0,
      membership_type_id: form.membership_type_id?.trim() || null,
      created_at: now,
    }
    await saveLocalWithSync('memberships', row, { table_name: 'memberships', operation: 'insert', remote_id: null })
    setSelectedId(id)
    setForm({ start_date: '', end_date: '', total_trainings: 12, membership_type_id: '' })
    await notify()
    setNewOpen(false)
  }

  const patchMembership = async (membershipId, patch) => {
    const db = await getDb()
    const prev = await db.get('memberships', membershipId)
    if (!prev) return
    const next = { ...prev, ...patch }
    await saveLocalWithSync('memberships', next, { table_name: 'memberships', operation: 'update', remote_id: membershipId })
    await notify()
  }

  const selected = items.find((m) => m.id === selectedId)

  const historySorted = useMemo(() => [...items].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))), [items])

  useEffect(() => {
    if (!selected) return
    setEdit({
      start_date: selected.start_date ?? '',
      end_date: selected.end_date ?? '',
      total_trainings: Number(selected.total_trainings ?? 0),
      membership_type_id: selected.membership_type_id ?? '',
    })
  }, [selectedId, selected])

  const saveEdit = async (e) => {
    e?.preventDefault?.()
    if (!selected) return
    const patch = {
      start_date: edit.start_date || null,
      end_date: edit.end_date || null,
      total_trainings: Number(edit.total_trainings) || 0,
      membership_type_id: edit.membership_type_id?.trim() || null,
    }
    await patchMembership(selected.id, patch)
    setEditOpenId(null)
  }

  const trainingsForMembership = useCallback(
    (m) => {
      return computeMembershipTrainings(m, trainings)
    },
    [trainings, computeMembershipTrainings],
  )

  const cancelTraining = useCallback(
    async (t, membership) => {
      if (!t?.id || !membership?.id) return
      setConfirmCancel({ t, membership })
    },
    [],
  )

  const doCancelTraining = useCallback(
    async (t, membership) => {
      if (!t?.id || !membership?.id) return

      // удалить тренировку
      await deleteLocalWithSync('trainings', t.id, 'trainings')

      // откатить used_trainings (если можно)
      const db = await getDb()
      const fresh = await db.get('memberships', membership.id)
      if (fresh) {
        const used = Number(fresh.used_trainings ?? 0)
        const mid = t?.data?.membership_id
        const d = String(t?.date ?? '').slice(0, 10)
        const s = String(fresh.start_date ?? '')
        const e = String(fresh.end_date ?? '')
        const counted =
          mid === fresh.id ||
          (!mid && d && s && e && d >= s && d <= e)
        if (counted) {
          const nextUsed = Number.isFinite(used) ? Math.max(0, used - 1) : 0
          if (nextUsed !== used) {
            await saveLocalWithSync('memberships', { ...fresh, used_trainings: nextUsed }, { table_name: 'memberships', operation: 'update', remote_id: fresh.id })
          }
        }
      }

      await notify()
    },
    [notify],
  )

  const trainerIdForTraining = recordTrainerId || user?.id

  const writeOffTraining = useCallback(
    async (membership) => {
      if (!membership?.id) return
      if (!trainerIdForTraining) {
        alert('Не задан тренер клиента (trainer_id).')
        return
      }
      const total = Number(membership.total_trainings ?? 0)
      const used = Number(membership.used_trainings ?? 0)
      if (Number.isFinite(total) && total > 0 && Number.isFinite(used) && used >= total) {
        alert('Лимит тренировок по абонементу исчерпан — списание невозможно.')
        return
      }

      const ok = window.confirm(
        'Списать тренировку?\n\nИспользование абонемента увеличится, а в дневнике появится служебная запись «Списание (неявка)».\nЭту запись можно будет отменить в этом же окне.',
      )
      if (!ok) return

      const today = todayLocalIso()
      const s = String(membership.start_date ?? '').slice(0, 10)
      const e = String(membership.end_date ?? '').slice(0, 10)
      if (s && today < s) {
        alert('Абонемент ещё не начался — списание на будущую дату невозможно.')
        return
      }
      // Сегодня в сроке — дата сегодня; после окончания — последний день абонемента (как раньше).
      const date = e && today > e ? e : today
      const now = new Date().toISOString()

      const trainingId = crypto.randomUUID()
      const row = {
        id: trainingId,
        client_id: clientId,
        trainer_id: trainerIdForTraining,
        club_id: clubId ?? null,
        date,
        type: 'Силовая',
        status: 'completed',
        data: {
          membership_id: membership.id,
          is_writeoff: true,
          training_focus: 'Списание (неявка)',
        },
        created_at: now,
        synced: false,
      }

      try {
        await saveLocalWithSync('trainings', row, { table_name: 'trainings', operation: 'insert', remote_id: null })
      } catch (e2) {
        alert(e2?.message ?? 'Не удалось списать тренировку')
        return
      }

      try {
        const db = await getDb()
        const fresh = await db.get('memberships', membership.id)
        if (fresh) {
          const usedFresh = Number(fresh.used_trainings ?? 0)
          const nextUsed = Number.isFinite(usedFresh) ? usedFresh + 1 : 1
          await saveLocalWithSync('memberships', { ...fresh, used_trainings: nextUsed }, { table_name: 'memberships', operation: 'update', remote_id: fresh.id })
        }
      } catch {
        // even if update failed, reconcile on reload will fix used_trainings by фактическим тренировкам
      }

      await notify()
    },
    [clientId, clubId, notify, trainerIdForTraining],
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      {newOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Новый абонемент" onClick={() => setNewOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Новый абонемент</h3>
            <form onSubmit={addMembership} className="grid" style={{ gap: 10 }}>
              <div className="grid grid-2" style={{ gap: 8 }}>
                <input className="input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                <input className="input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="Всего тренировок"
                value={form.total_trainings}
                onChange={(e) => setForm((f) => ({ ...f, total_trainings: e.target.value }))}
              />
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="membership-new-type">
                  Тип абонемента
                </label>
                <select
                  id="membership-new-type"
                  className="input"
                  value={form.membership_type_id}
                  onChange={(e) => setForm((f) => ({ ...f, membership_type_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {typeOptionsForSelect(form.membership_type_id).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-touch" onClick={() => setNewOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary btn-touch">
                  Добавить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && editOpenId === selected.id && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Редактирование абонемента" onClick={() => setEditOpenId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={saveEdit} className="grid" style={{ gap: 10 }}>
              <div className="grid grid-2" style={{ gap: 8 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Начало</label>
                  <input className="input" type="date" value={edit.start_date} onChange={(e) => setEdit((s) => ({ ...s, start_date: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Окончание</label>
                  <input className="input" type="date" value={edit.end_date} onChange={(e) => setEdit((s) => ({ ...s, end_date: e.target.value }))} />
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label">Всего тренировок</label>
                <input className="input" type="number" min={0} value={edit.total_trainings} onChange={(e) => setEdit((s) => ({ ...s, total_trainings: e.target.value }))} />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="membership-edit-type">
                  Тип абонемента
                </label>
                <select
                  id="membership-edit-type"
                  className="input"
                  value={edit.membership_type_id}
                  onChange={(e) => setEdit((s) => ({ ...s, membership_type_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {typeOptionsForSelect(edit.membership_type_id).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                Использовано: <strong>{selected.used_trainings ?? 0}</strong>
              </div>

              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-touch" onClick={() => setEditOpenId(null)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary btn-touch">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewOpenId && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Тренировки абонемента"
          onClick={() => setViewOpenId(null)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const m = items.find((x) => x.id === viewOpenId)
              const list = m ? trainingsForMembership(m) : []
              const total = Number(m?.total_trainings ?? 0)
              return (
                <div className="grid" style={{ gap: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                    <h3 style={{ margin: 0 }}>Тренировки абонемента</h3>
                    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-icon-square"
                        aria-label="Списать тренировку"
                        title="Списать тренировку"
                        onClick={() => writeOffTraining(m)}
                        disabled={!m}
                      >
                        <CheckCircle2 size={18} aria-hidden />
                      </button>
                      <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Закрыть" title="Закрыть" onClick={() => setViewOpenId(null)}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Период: <strong style={{ color: 'var(--text)' }}>{formatDateRu(m?.start_date)} — {formatDateRu(m?.end_date)}</strong>
                  </div>

                  {list.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Пока нет завершённых тренировок по этому абонементу.
                    </p>
                  ) : (
                    <ul className="list" style={{ margin: 0 }}>
                      {list.map((t, idx) => (
                        <li key={t.id} className="list-item" style={{ padding: 12 }}>
                          <div className="row" style={{ width: '100%', justifyContent: 'flex-start', gap: 12, flexWrap: 'nowrap', alignItems: 'center' }}>
                            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                              <strong>{formatDateRu(t.date ?? t.created_at?.slice(0, 10))}</strong>
                              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                                тренировка {idx + 1}/{Number.isFinite(total) && total > 0 ? total : '—'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon-square"
                              aria-label="Отменить тренировку"
                              title="Отменить тренировку"
                              style={{ marginLeft: 'auto' }}
                              onClick={() => cancelTraining(t, m)}
                            >
                              <Trash2 size={18} aria-hidden />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {confirmCancel && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Подтверждение удаления тренировки" onClick={() => setConfirmCancel(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Отменить тренировку?</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Дата: <strong style={{ color: 'var(--text)' }}>{formatDateRu(confirmCancel.t?.date ?? confirmCancel.t?.created_at?.slice(0, 10))}</strong>
            </p>
            <p className="muted" style={{ marginTop: 6 }}>
              Тренировка будет удалена из дневника и из истории абонемента. Если это было списание (неявка), списание тоже отменится.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" className="btn btn-ghost btn-touch" onClick={() => setConfirmCancel(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary btn-touch"
                onClick={async () => {
                  const payload = confirmCancel
                  setConfirmCancel(null)
                  await doCancelTraining(payload.t, payload.membership)
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Абонементы</h3>
          <button
            type="button"
            className="btn btn-primary btn-icon-square"
            aria-label="Новый абонемент"
            title="Новый абонемент"
            onClick={() => setNewOpen(true)}
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            <MembershipStatusIcon kind="active" /> действует
          </span>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            <MembershipStatusIcon kind="depleted" /> лимит
          </span>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            <MembershipStatusIcon kind="no_window" /> срок
          </span>
        </div>
        {historySorted.length === 0 && <p className="muted">Пока нет записей.</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Период</th>
                <th className="mem-col-type">Тип</th>
                <th>Статус</th>
                <th>Использовано</th>
                <th>Создан</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {historySorted.map((m) => (
                <tr key={m.id}>
                  <td>
                    {formatDateRu(m.start_date)} — {formatDateRu(m.end_date)}
                  </td>
                  <td className="mem-col-type" title={membershipTypeCode(typesById, m.membership_type_id) || undefined}>
                    {formatTypeCell(m.membership_type_id)}
                  </td>
                  <td style={{ width: 56 }}>
                    <MembershipStatusIcon kind={membershipVisualKind(m, todayIso)} />
                  </td>
                  <td>
                    {m.used_trainings ?? 0}/{m.total_trainings ?? '—'}
                  </td>
                  <td className="muted">{formatDateTimeRu(m.created_at)}</td>
                  <td style={{ width: 96 }}>
                    <div className="mem-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-square"
                        aria-label="Посмотреть тренировки абонемента"
                        title="Тренировки абонемента"
                        onClick={() => {
                          setSelectedId(m.id)
                          setViewOpenId(m.id)
                        }}
                      >
                        <Eye size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-square"
                        aria-label="Редактировать абонемент"
                        title="Редактировать"
                        onClick={() => {
                          setSelectedId(m.id)
                          setEditOpenId(m.id)
                        }}
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
