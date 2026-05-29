import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { aggregateMembershipTypeStats } from '../../lib/admin/membershipTypeStatsAgg'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { formatIsoRu, getDateRange, isDateInRange, PERIOD_PRESETS } from '../../lib/period'
import { MembershipTypeStatsBlock } from '../../components/MembershipTypeStatsBlock'

export function TrainerProfile() {
  const { user } = useAuth()
  const trainerClubId = user?.club_id ?? null
  const [clients, setClients] = useState([])
  const [trainings, setTrainings] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [membershipTypes, setMembershipTypes] = useState([])
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const reload = useCallback(async () => {
    if (!user?.id) return
    const { clients: c, trainings: t, memByClient: map } = await loadTrainerWorkspaceSnapshot(user.id, trainerClubId)
    setClients(c)
    setTrainings(t)
    setMemByClient(map)
  }, [user?.id, trainerClubId])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => void reload(), { shouldRun: shouldReloadTrainerClientList })

  useEffect(() => {
    if (!trainerClubId) {
      setMembershipTypes([])
      return
    }
    void listMembershipTypesForClub(trainerClubId).then(setMembershipTypes)
  }, [trainerClubId])

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])

  const membershipsFlat = useMemo(() => {
    const out = []
    for (const list of Object.values(memByClient)) {
      if (Array.isArray(list)) out.push(...list)
    }
    return out
  }, [memByClient])

  const typeStats = useMemo(() => {
    if (!user?.id || !range.start || !range.end) {
      return { byType: [], byTrainerByType: [], totalCounted: 0 }
    }
    const inP = (d) => isDateInRange(d, range.start, range.end)
    const inRange = trainings.filter((t) => inP(t.date))
    return aggregateMembershipTypeStats({
      trainings: inRange,
      memberships: membershipsFlat,
      membershipTypes,
      trainerIdFilter: user.id,
    })
  }, [trainings, membershipsFlat, membershipTypes, user?.id, range.start, range.end])

  const stats = useMemo(() => {
    const inP = (d) => isDateInRange(d, range.start, range.end)
    const done = trainings.filter((t) => t.trainer_id === user?.id && t.status === 'completed' && inP(t.date))
    return {
      workouts: done.length,
      clients: clients.length,
    }
  }, [trainings, clients, user?.id, range])

  return (
    <div className="grid stagger" style={{ gap: 18 }}>
      <section className="card">
        <h1 className="section-title" style={{ marginBottom: 6 }}>
          Профиль
        </h1>
        <p className="section-sub" style={{ margin: 0 }}>
          {user?.name ?? user?.email ?? 'Тренер'}
        </p>
      </section>

      <section className="card">
        <h2 className="section-title td-period__title">Период</h2>
        <div className="row td-period__buttons">
          {PERIOD_PRESETS.map((p) => (
            <button key={p.id} type="button" className={`btn ${period === p.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-2 td-period__custom">
            <div className="field td-period__field">
              <label className="label">С</label>
              <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required />
            </div>
            <div className="field td-period__field">
              <label className="label">По</label>
              <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} required />
            </div>
          </div>
        )}
        <p className="muted td-range">
          {range.start && range.end ? (
            <>
              Диапазон: {formatIsoRu(range.start)} — {formatIsoRu(range.end)}
            </>
          ) : period === 'custom' ? (
            <span className="admin-inline-note">Укажите даты «с» и «по» для своего периода.</span>
          ) : (
            <>Диапазон: —</>
          )}
        </p>
      </section>

      <section className="grid grid-2" style={{ gap: 12 }}>
        <div className="card stat-card">
          <div className="stat-card__top">
            <h3 className="td-stat-title">Тренировок за период</h3>
            <ClipboardList className="stat-card__icon" size={22} aria-hidden />
          </div>
          <p className="stat-card__value">{stats.workouts}</p>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <h3 className="td-stat-title">Всего клиентов</h3>
            <Users className="stat-card__icon" size={22} aria-hidden />
          </div>
          <p className="stat-card__value">{stats.clients}</p>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title td-section-title">По типам абонементов</h2>
        <MembershipTypeStatsBlock byType={typeStats.byType} showTrainerBreakdown={false} />
      </section>
    </div>
  )
}
