import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listMemberships, listTrainingsForClient } from '../lib/dataAccess'
import { filterMembershipsByHall, normalizeMembershipHall } from '../lib/membershipHallCore.js'
import { ensureClientTrainingsCached } from '../lib/clientTrainingsEnsure.js'
import { detachWeightEntriesFromTraining } from '../lib/clientWeightService.js'
import { getDb } from '../lib/localDb'
import { deleteLocalWithSync, saveLocalWithSync } from '../lib/syncService'
import { ensureOpenHallAfterMembershipSave } from '../lib/clientHallLifecycleSyncService.js'
import { planMembershipUsedReconcile } from '../lib/membership/membershipUsedReconcile.js'
import {
  isMembershipTotalBroken,
  membershipBrokenTotalHintRu,
  normalizeMembershipTotalTrainings,
  resolveEffectiveMembershipUsed,
  shouldConfirmSuspiciousLowTotal,
  suspiciousLowTotalConfirmMessageRu,
  validateMembershipTotalAgainstUsed,
} from '../lib/membership/membershipTotalGuardCore.js'
import { defaultMembershipEndIso, formatDateRu, todayLocalIso } from '../lib/dateRu'
import { completedTrainingsOnMembership } from '../lib/membershipRules'
import { buildMembershipDeleteConfirmCopy } from '../lib/membershipDeleteCore'
import { ensureMembershipTypesForClub, isTrainerAssignableMembershipType, membershipTypeCode } from '../lib/membershipTypesService'
import { findPnkTrialMembershipType, isPnkTrialTypeRow } from '../lib/pnk/pnkTrialTrainingCore'
import {
  classifySaleClientSegment,
  saleClientSegmentHintRu,
} from '../lib/admin/salesClientSegmentCore'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { ModalHeader } from './ModalHeader'
import { useAuth } from '../context/AuthContext'
import { AdminMembershipPaidAmountField } from './admin/AdminMembershipPaidAmountField.jsx'
import { paidAmountFromMembershipForm } from '../lib/admin/membershipPaidAmountCore.js'
import { MembershipHistoryCard } from './membership/MembershipHistoryCard.jsx'
import { notifyAdminClientsBrowseStorageChanged } from '../lib/admin/adminClientsListReloadCore.js'

function newId() {
  return crypto.randomUUID()
}

export function MembershipManager({
  clientId,
  clubId,
  recordTrainerId,
  onChanged,
  /** Сразу открыть форму нового абонемента (шаг ПНК → ДК). */
  autoOpenNew = false,
  /** По умолчанию выбирать платный тип, не БЗ. */
  preferPaidType = false,
  /** Вкладка зала: по умолчанию только ПЗ (тренер не видит ТЗ/АЗ). */
  membershipHall = 'pz',
  /** Админ / менеджер: цена пакета на абоне (paid_amount). Тренер планшета — скрыто. */
  showPaidAmount = false,
}) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({
    start_date: '',
    end_date: '',
    total_trainings: 12,
    membership_type_id: '',
    paid_amount: '',
  })
  const [edit, setEdit] = useState({
    start_date: '',
    end_date: '',
    total_trainings: 0,
    membership_type_id: '',
    paid_amount: '',
  })
  const [editOpenId, setEditOpenId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [membershipTypes, setMembershipTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [typesLoadError, setTypesLoadError] = useState('')
  const [trainings, setTrainings] = useState([])
  const [viewOpenId, setViewOpenId] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null) // { t, membership }
  const [confirmDeleteMembership, setConfirmDeleteMembership] = useState(null) // membership row
  const autoOpenedRef = useRef(false)

  const todayIso = useMemo(() => todayLocalIso(), [])
  const hallFilter = normalizeMembershipHall(membershipHall) || 'pz'

  const saleSegmentHint = useMemo(() => {
    if (!newOpen) return ''
    const saleDate = String(form.start_date || todayIso).slice(0, 10)
    // Оформление ДК в ПНК: БЗ (пробный) не считаем «уже ДК».
    let memList = items
    if (preferPaidType) {
      const trialTypeIds = new Set(
        (membershipTypes ?? []).filter((t) => isPnkTrialTypeRow(t)).map((t) => String(t.id)),
      )
      memList = (items ?? []).filter((m) => !trialTypeIds.has(String(m?.membership_type_id ?? '')))
    }
    const result = classifySaleClientSegment({
      saleDate,
      clientId,
      memList,
      trainings,
      ignoreMembershipsStartingOnSaleDate: preferPaidType === true,
      firstPaidSale: preferPaidType === true,
    })
    return saleClientSegmentHintRu(result)
  }, [newOpen, form.start_date, todayIso, clientId, items, trainings, preferPaidType, membershipTypes])

  const reloadTypes = useCallback(
    async (opts = {}) => {
      if (!clubId) {
        setMembershipTypes([])
        setTypesLoadError('')
        return
      }
      const silent = opts.silent === true
      if (!silent) setTypesLoading(true)
      setTypesLoadError('')
      try {
        const { types, error } = await ensureMembershipTypesForClub(clubId, {
          force: opts.force === true,
        })
        setMembershipTypes(types)
        if (error) setTypesLoadError(String(error))
      } catch (e) {
        setTypesLoadError(String(e?.message ?? 'Не удалось загрузить типы'))
      } finally {
        if (!silent) setTypesLoading(false)
      }
    },
    [clubId],
  )

  const pickDefaultTypeId = useCallback(
    (types) => {
      const list = types ?? membershipTypes
      const assignable = list.filter((t) => t.is_active !== false && isTrainerAssignableMembershipType(t))
      if (preferPaidType) {
        const paid = assignable.find((t) => !isPnkTrialTypeRow(t))
        if (paid?.id) return { id: String(paid.id), total: 12 }
      }
      const bz = findPnkTrialMembershipType(list)
      if (bz?.id && !preferPaidType) {
        return { id: String(bz.id), total: 1 }
      }
      const first = assignable.find((t) => (preferPaidType ? !isPnkTrialTypeRow(t) : true)) ?? assignable[0]
      if (first?.id) {
        return { id: String(first.id), total: preferPaidType ? 12 : 1 }
      }
      return { id: '', total: preferPaidType ? 12 : 1 }
    },
    [membershipTypes, preferPaidType],
  )

  const openNewMembership = useCallback(() => {
    setNewOpen(true)
    const activeCount = membershipTypes.filter((t) => t.is_active !== false).length
    if (activeCount === 0) void reloadTypes({ force: true })
    const picked = pickDefaultTypeId(membershipTypes)
    setForm((f) => ({
      ...f,
      start_date: f.start_date || todayIso,
      end_date: f.end_date || defaultMembershipEndIso(f.start_date || todayIso),
      total_trainings: picked.total,
      membership_type_id: picked.id,
    }))
  }, [membershipTypes, reloadTypes, pickDefaultTypeId, todayIso])

  useEffect(() => {
    void reloadTypes()
  }, [reloadTypes])

  useEffect(() => {
    if (!autoOpenNew || autoOpenedRef.current) return
    if (typesLoading) return
    autoOpenedRef.current = true
    openNewMembership()
  }, [autoOpenNew, typesLoading, openNewMembership, membershipTypes])

  useEffect(() => {
    if (!editOpenId || !clubId) return undefined
    const activeCount = membershipTypes.filter((t) => t.is_active !== false).length
    if (activeCount === 0) void reloadTypes({ force: true })
    return undefined
  }, [editOpenId, clubId, membershipTypes, reloadTypes])

  const typesById = useMemo(() => new Map(membershipTypes.map((t) => [t.id, t])), [membershipTypes])

  const typeOptionsForSelect = useCallback(
    (selectedTypeId) => {
      const sid = String(selectedTypeId ?? '').trim()
      const active = membershipTypes.filter((t) => t.is_active !== false && isTrainerAssignableMembershipType(t))
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

  const computeMembershipTrainings = useCallback((m, allTrainings) => completedTrainingsOnMembership(m, allTrainings), [])

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const reload = useCallback(async () => {
    await ensureClientTrainingsCached(clientId)
    const [mAll, t0] = await Promise.all([listMemberships(clientId), listTrainingsForClient(clientId)])
    setTrainings(t0)
    const m0 = filterMembershipsByHall(mAll, hallFilter)

    const reconcilePlan = planMembershipUsedReconcile(m0, t0)
    const nextUsedById = new Map(reconcilePlan.map(({ membership, nextUsed }) => [membership.id, nextUsed]))
    const next = []
    for (const m of m0) {
      const nextUsed = nextUsedById.get(m.id)
      if (nextUsed != null) {
        const patched = { ...m, used_trainings: nextUsed }
        next.push(patched)
        try {
          await saveLocalWithSync('memberships', patched, {
            table_name: 'memberships',
            operation: 'update',
            remote_id: patched.id,
          })
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
  }, [clientId, computeMembershipTrainings, hallFilter])

  useEffect(() => {
    const onStorage = (e) => {
      // Пока открыта форма — не дёргаем типы (native select иначе закрывается).
      if (newOpen || editOpenId) return
      const reason = String(e?.detail?.reason ?? '')
      if (reason === 'membership-dates-shifted') {
        void reload()
        return
      }
      if (reason === 'training-completed' || reason === 'membership-used-reconciled') {
        void reload()
        return
      }
      void reloadTypes({ silent: true })
    }
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [reloadTypes, newOpen, editOpenId, reload])

  useEffect(() => {
    reload()
  }, [reload])

  const notify = async () => {
    await reload()
    onChanged?.()
    const cid = String(clubId ?? '').trim()
    if (cid) {
      notifyAdminClientsBrowseStorageChanged({
        reason: 'desk-membership-ledger',
        clientId,
        clubId: cid,
      })
    }
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
    const start = String(form.start_date || today).slice(0, 10)
    const end = String(form.end_date || defaultMembershipEndIso(start)).slice(0, 10)
    if (end < start) {
      alert('Дата окончания не может быть раньше начала')
      return
    }
    let paid_amount = null
    if (showPaidAmount) {
      if (String(form.paid_amount ?? '').trim() !== '' && paidAmountFromMembershipForm(form.paid_amount) == null) {
        alert('Цена пакета: число ≥ 0')
        return
      }
      paid_amount = paidAmountFromMembershipForm(form.paid_amount)
    }
    const totalTrainings = normalizeMembershipTotalTrainings(form.total_trainings)
    const typeId = form.membership_type_id?.trim() || ''
    const typeRow = typeId ? membershipTypes.find((t) => String(t.id) === typeId) : null
    if (
      shouldConfirmSuspiciousLowTotal({
        totalTrainings,
        isPnkTrialType: isPnkTrialTypeRow(typeRow),
      })
    ) {
      const ok = window.confirm(
        suspiciousLowTotalConfirmMessageRu({
          typeCode: membershipTypeCode(typesById, typeId),
          totalTrainings,
        }),
      )
      if (!ok) return
    }
    const row = {
      id,
      client_id: clientId,
      club_id: clubId,
      start_date: start,
      end_date: end,
      total_trainings: totalTrainings,
      used_trainings: 0,
      membership_type_id: typeId || null,
      hall: hallFilter,
      created_at: now,
    }
    if (showPaidAmount) row.paid_amount = paid_amount
    await saveLocalWithSync('memberships', row, { table_name: 'memberships', operation: 'insert', remote_id: null })
    try {
      await ensureOpenHallAfterMembershipSave(clientId, hallFilter || 'pz')
    } catch (e) {
      console.warn('[membership] ensure open hall', e?.message ?? e)
    }
    setSelectedId(id)
    setForm({ start_date: '', end_date: '', total_trainings: 12, membership_type_id: '', paid_amount: '' })
    await notify()
    setNewOpen(false)
  }

  const patchMembership = async (membershipId, patch) => {
    const db = await getDb()
    const prev = await db.get('memberships', membershipId)
    if (!prev) return
    const next = { ...prev, ...patch }
    await saveLocalWithSync('memberships', next, { table_name: 'memberships', operation: 'update', remote_id: membershipId })
    if (
      patch.start_date != null ||
      patch.end_date != null ||
      patch.total_trainings != null ||
      patch.hall != null
    ) {
      try {
        await ensureOpenHallAfterMembershipSave(clientId, normalizeMembershipHall(next.hall) || hallFilter || 'pz')
      } catch (e) {
        console.warn('[membership] ensure open hall', e?.message ?? e)
      }
    }
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
      paid_amount:
        selected.paid_amount != null && selected.paid_amount !== '' ? String(selected.paid_amount) : '',
    })
  }, [selectedId, selected])

  const saveEdit = async (e) => {
    e?.preventDefault?.()
    if (!selected) return
    const start = String(edit.start_date || selected.start_date || todayIso).slice(0, 10)
    const end = String(edit.end_date || selected.end_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      alert('Укажите дату начала абонемента')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      alert('Укажите дату окончания абонемента')
      return
    }
    if (end < start) {
      alert('Дата окончания не может быть раньше начала')
      return
    }
    const totalTrainings = normalizeMembershipTotalTrainings(edit.total_trainings)
    const usedDiary = completedTrainingsOnMembership(selected, trainings).length
    const totalGate = validateMembershipTotalAgainstUsed({
      totalTrainings,
      usedStored: selected.used_trainings,
      usedDiary,
    })
    if (!totalGate.ok) {
      alert(totalGate.error)
      return
    }
    const nextTypeId = edit.membership_type_id?.trim() || ''
    const nextTypeRow = nextTypeId ? membershipTypes.find((t) => String(t.id) === nextTypeId) : null
    const prevTotal = normalizeMembershipTotalTrainings(selected.total_trainings)
    if (
      shouldConfirmSuspiciousLowTotal({
        totalTrainings,
        isPnkTrialType: isPnkTrialTypeRow(nextTypeRow),
      }) &&
      totalTrainings !== prevTotal
    ) {
      const ok = window.confirm(
        suspiciousLowTotalConfirmMessageRu({
          typeCode: membershipTypeCode(typesById, nextTypeId),
          totalTrainings,
        }),
      )
      if (!ok) return
    }
    const patch = {
      start_date: start,
      end_date: end,
      total_trainings: totalTrainings,
      membership_type_id: nextTypeId || null,
    }
    if (showPaidAmount) {
      if (String(edit.paid_amount ?? '').trim() !== '' && paidAmountFromMembershipForm(edit.paid_amount) == null) {
        alert('Цена пакета: число ≥ 0')
        return
      }
      patch.paid_amount = paidAmountFromMembershipForm(edit.paid_amount)
    }
    await patchMembership(selected.id, patch)
    setEditOpenId(null)
  }

  const requestDeleteMembership = useCallback((m) => {
    if (!m?.id) return
    setConfirmDeleteMembership(m)
  }, [])

  const doDeleteMembership = useCallback(
    async (m) => {
      if (!m?.id) return
      await deleteLocalWithSync('memberships', m.id, 'memberships')
      if (selectedId === m.id) setSelectedId(null)
      if (editOpenId === m.id) setEditOpenId(null)
      if (viewOpenId === m.id) setViewOpenId(null)
      await notify()
    },
    [selectedId, editOpenId, viewOpenId, notify],
  )

  const deleteConfirmCopy = useMemo(() => {
    if (!confirmDeleteMembership) return null
    return buildMembershipDeleteConfirmCopy({
      membership: confirmDeleteMembership,
      linkedTrainingsCount: completedTrainingsOnMembership(confirmDeleteMembership, trainings).length,
    })
  }, [confirmDeleteMembership, trainings])

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
      await detachWeightEntriesFromTraining(t.id, t.client_id ?? clientId)
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
      {newOpen &&
        createPortal(
          <div
            className="modal-overlay modal-overlay--center"
            role="dialog"
            aria-modal="true"
            aria-label={preferPaidType ? 'Платный абонемент ДК' : 'Новый абонемент'}
          >
            <div className="modal-panel modal-panel--membership-form">
              <ModalHeader
                title={preferPaidType ? 'Платный абонемент (ДК)' : 'Новый абонемент'}
                onClose={() => setNewOpen(false)}
              />
              <form onSubmit={addMembership} className="grid membership-form" style={{ gap: 12 }}>
                {preferPaidType ? (
                  <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
                    Выберите платный тип (не БЗ), срок и число тренировок — затем «Добавить». После этого нажмите
                    «Оформлен (ДК)» в шапке воронки.
                  </p>
                ) : null}
                {saleSegmentHint ? (
                  <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }} title="Сегмент для отчёта продаж">
                    Сегмент продажи: <strong style={{ color: 'var(--text)' }}>{saleSegmentHint}</strong>
                  </p>
                ) : null}
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <input
                    className="input"
                    type="date"
                    value={form.start_date}
                    aria-label="Дата начала"
                    onChange={(e) => {
                      const start = e.target.value
                      setForm((f) => ({
                        ...f,
                        start_date: start,
                        end_date: start ? defaultMembershipEndIso(start) : f.end_date,
                      }))
                    }}
                  />
                  <input
                    className="input"
                    type="date"
                    value={form.end_date}
                    aria-label="Дата окончания"
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.35 }}>
                  Подсказка: срок — календарный месяц (с того же числа: 24 → 24), не «+30 дней».
                </p>
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
                    disabled={typesLoading}
                    onChange={(e) => setForm((f) => ({ ...f, membership_type_id: e.target.value }))}
                  >
                    <option value="">{typesLoading ? 'Загрузка типов…' : '—'}</option>
                    {typeOptionsForSelect(form.membership_type_id).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code}
                        {isPnkTrialTypeRow(t) ? ' (БЗ)' : ''}
                      </option>
                    ))}
                  </select>
                  {!typesLoading && typeOptionsForSelect(form.membership_type_id).length === 0 ? (
                    <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                      {typesLoadError || 'Типов нет в кэше. Проверьте сеть или нажмите Sync в шапке.'}
                    </p>
                  ) : null}
                </div>
                {showPaidAmount ? (
                  <AdminMembershipPaidAmountField
                    id="membership-new-paid"
                    value={form.paid_amount}
                    onChange={(v) => setForm((f) => ({ ...f, paid_amount: v }))}
                  />
                ) : null}
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary btn-touch">
                    Добавить
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {selected &&
        editOpenId === selected.id &&
        createPortal(
          <div className="modal-overlay modal-overlay--center" role="dialog" aria-modal="true" aria-label="Редактирование абонемента">
            <div className="modal-panel modal-panel--membership-form">
              <ModalHeader title="Редактирование абонемента" onClose={() => setEditOpenId(null)} />
              <form onSubmit={saveEdit} className="grid membership-form" style={{ gap: 12 }}>
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
                    disabled={typesLoading}
                    onChange={(e) => setEdit((s) => ({ ...s, membership_type_id: e.target.value }))}
                  >
                    <option value="">{typesLoading ? 'Загрузка типов…' : '—'}</option>
                    {typeOptionsForSelect(edit.membership_type_id).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code}
                      </option>
                    ))}
                  </select>
                </div>

                {showPaidAmount ? (
                  <AdminMembershipPaidAmountField
                    id="membership-edit-paid"
                    value={edit.paid_amount}
                    onChange={(v) => setEdit((s) => ({ ...s, paid_amount: v }))}
                  />
                ) : null}

                <div className="muted" style={{ fontSize: 13 }}>
                  Использовано:{' '}
                  <strong>
                    {resolveEffectiveMembershipUsed(
                      selected.used_trainings,
                      completedTrainingsOnMembership(selected, trainings).length,
                    )}
                  </strong>
                  {isMembershipTotalBroken({
                    totalTrainings: edit.total_trainings,
                    usedEffective: resolveEffectiveMembershipUsed(
                      selected.used_trainings,
                      completedTrainingsOnMembership(selected, trainings).length,
                    ),
                  }) ? (
                    <span style={{ color: 'var(--warning, #f59e0b)', marginLeft: 8 }}>
                      — {membershipBrokenTotalHintRu()}
                    </span>
                  ) : null}
                </div>

                <div className="row" style={{ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-touch"
                    onClick={() => {
                      if (!selected) return
                      setEditOpenId(null)
                      requestDeleteMembership(selected)
                    }}
                  >
                    Удалить
                  </button>
                  <button type="submit" className="btn btn-primary btn-touch">
                    Сохранить
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {viewOpenId &&
        createPortal(
          <div
            className="modal-overlay modal-overlay--center modal-overlay--membership-view"
            role="dialog"
            aria-modal="true"
            aria-label="Тренировки абонемента"
            onClick={() => setViewOpenId(null)}
          >
            <div className="modal-panel modal-panel--membership-view" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const m = items.find((x) => x.id === viewOpenId)
                const list = m ? trainingsForMembership(m) : []
                const total = Number(m?.total_trainings ?? 0)
                const used = resolveEffectiveMembershipUsed(
                  m?.used_trainings,
                  list.length,
                )
                const broken = isMembershipTotalBroken({ totalTrainings: total, usedEffective: used })
                const canWriteOff =
                  m && Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
                return (
                  <div className="membership-view">
                    <div className="membership-view__header">
                      <ModalHeader title="Тренировки абонемента" onClose={() => setViewOpenId(null)} />
                      <div className="muted membership-view__period">
                        Период:{' '}
                        <strong style={{ color: 'var(--text)' }}>
                          {formatDateRu(m?.start_date)} — {formatDateRu(m?.end_date)}
                        </strong>
                        {Number.isFinite(total) && total > 0 ? (
                          <>
                            {' '}
                            · использовано{' '}
                            <strong style={{ color: broken ? 'var(--warning, #f59e0b)' : 'var(--text)' }}>
                              {used}/{total}
                            </strong>
                            {broken ? (
                              <span style={{ color: 'var(--warning, #f59e0b)' }}>
                                {' '}
                                · {membershipBrokenTotalHintRu()}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="membership-view__body">
                      {list.length === 0 ? (
                        <p className="muted membership-view__empty">Пока нет завершённых тренировок по этому абонементу.</p>
                      ) : (
                        <ul className="membership-training-list">
                          {list.map((t, idx) => (
                            <li key={t.id} className="membership-training-list__item">
                              <div className="membership-training-list__main">
                                <strong>{formatDateRu(t.date ?? t.created_at?.slice(0, 10))}</strong>
                                <div className="muted membership-training-list__meta">
                                  тренировка {idx + 1}/{Number.isFinite(total) && total > 0 ? total : '—'}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon-square"
                                aria-label="Отменить тренировку"
                                title="Отменить тренировку"
                                onClick={() => cancelTraining(t, m)}
                              >
                                <Trash2 size={18} aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="membership-view__footer">
                      {Number.isFinite(total) && total > 0 ? (
                        <span className="membership-view__usage-chip" aria-live="polite">
                          {used}/{total}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-primary btn-touch membership-view__writeoff"
                        aria-label="Списать тренировку"
                        title={canWriteOff ? 'Списать тренировку с абонемента' : 'Лимит тренировок исчерпан'}
                        onClick={() => writeOffTraining(m)}
                        disabled={!canWriteOff}
                      >
                        <CheckCircle2 size={18} aria-hidden />
                        Списать тренировку
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>,
          document.body,
        )}

      {confirmCancel &&
        createPortal(
          <div
            className="modal-overlay modal-overlay--center"
            role="dialog"
            aria-modal="true"
            aria-label="Подтверждение удаления тренировки"
            onClick={() => setConfirmCancel(null)}
          >
            <div className="modal-panel modal-panel--membership-form" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Отменить тренировку?</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Дата:{' '}
                <strong style={{ color: 'var(--text)' }}>
                  {formatDateRu(confirmCancel.t?.date ?? confirmCancel.t?.created_at?.slice(0, 10))}
                </strong>
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                Тренировка будет удалена из дневника и из истории абонемента. Если это было списание (неявка), списание
                тоже отменится.
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
          </div>,
          document.body,
        )}

      {confirmDeleteMembership &&
        deleteConfirmCopy &&
        createPortal(
          <div
            className="modal-overlay modal-overlay--center"
            role="dialog"
            aria-modal="true"
            aria-label={deleteConfirmCopy.blocked ? 'Нужно сначала удалить тренировки' : 'Подтверждение удаления абонемента'}
            onClick={() => setConfirmDeleteMembership(null)}
          >
            <div className="modal-panel modal-panel--membership-form" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{deleteConfirmCopy.title}</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Период:{' '}
                <strong style={{ color: 'var(--text)' }}>{deleteConfirmCopy.periodLabel}</strong>
                {deleteConfirmCopy.usedLabel ? (
                  <>
                    {' '}
                    · использовано <strong style={{ color: 'var(--text)' }}>{deleteConfirmCopy.usedLabel}</strong>
                  </>
                ) : null}
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                {deleteConfirmCopy.body}
              </p>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" className="btn btn-ghost btn-touch" onClick={() => setConfirmDeleteMembership(null)}>
                  {deleteConfirmCopy.blocked ? 'Закрыть' : 'Отмена'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-touch"
                  onClick={async () => {
                    const m = confirmDeleteMembership
                    setConfirmDeleteMembership(null)
                    if (deleteConfirmCopy.blocked) {
                      if (m?.id) {
                        setSelectedId(m.id)
                        setViewOpenId(m.id)
                      }
                      return
                    }
                    await doDeleteMembership(m)
                  }}
                >
                  {deleteConfirmCopy.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <MembershipHistoryCard
        preferPaidType={preferPaidType}
        showPaidAmount={showPaidAmount}
        historySorted={historySorted}
        trainings={trainings}
        typesById={typesById}
        todayIso={todayIso}
        formatTypeCell={formatTypeCell}
        onOpenNew={openNewMembership}
        onView={(m) => {
          setSelectedId(m.id)
          setViewOpenId(m.id)
        }}
        onEdit={(m) => {
          setSelectedId(m.id)
          setEditOpenId(m.id)
        }}
        onDelete={requestDeleteMembership}
      />
    </div>
  )
}
