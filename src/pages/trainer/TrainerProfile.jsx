import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { listLocalClients, listTrainingsForTrainer } from '../../lib/dataAccess'
import { formatIsoRu, getDateRange, isDateInRange } from '../../lib/period'

export function TrainerProfile() {
  const { user } = useAuth()
  const trainerClubId = user?.club_id ?? null
  const [clients, setClients] = useState([])
  const [trainings, setTrainings] = useState([])
  const [period, setPeriod] = useState('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const [c, t] = await Promise.all([listLocalClients(user.id, trainerClubId), listTrainingsForTrainer(user.id, trainerClubId)])
      if (!cancelled) {
        setClients(c)
        setTrainings(t)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, trainerClubId])

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])
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
          {[
            { id: 'today', label: 'Сегодня' },
            { id: 'yesterday', label: 'Вчера' },
            { id: '7d', label: '7 дней' },
            { id: '30d', label: '30 дней' },
            { id: 'custom', label: 'Свой' },
          ].map((p) => (
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

      <section className="grid grid-3">
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
    </div>
  )
}

