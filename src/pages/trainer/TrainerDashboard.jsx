import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Dumbbell, LogOut, RefreshCw, UserCircle, UserPlus, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { invalidateTrainerWorkspaceCache, loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import { pullTrainerWorkspaceFromCloud } from '../../lib/trainerPullService'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { formatIsoRu, getDateRange, isDateInRange, PERIOD_PRESETS } from '../../lib/period'
import { flushSyncQueue, saveLocalWithSync } from '../../lib/syncService'
import { subscribeNetworkStatus } from '../../lib/networkReachability'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { pickUsableMembershipForDate } from '../../lib/membershipRules'
import { membershipSignal } from '../../lib/clientListSignals'
import { aggregateMembershipTypeStats } from '../../lib/admin/membershipTypeStatsAgg'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { MembershipTypeStatsBlock } from '../../components/MembershipTypeStatsBlock'
import { formatClientName } from '../../lib/clientNameFormat'

function lastTrainingDate(trainings, clientId) {
  const ts = trainings.filter((t) => t.client_id === clientId).map((t) => t.date || t.created_at?.slice(0, 10))
  if (!ts.length) return '—'
  return formatDateRu(ts.sort((a, b) => String(b).localeCompare(String(a)))[0])
}

export function TrainerDashboard() {
  const { user, supabaseReady, signOut, refreshUserProfile } = useAuth()
  const trainerClubId = user?.club_id ?? null

  useEffect(() => {
    if (user?.id && !user?.club_id) void refreshUserProfile()
  }, [user?.id, user?.club_id, refreshUserProfile])
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  useEffect(() => subscribeNetworkStatus(setOnline), [])
  const [clients, setClients] = useState([])
  const [trainings, setTrainings] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', birth_date: '' })
  const [membershipTypes, setMembershipTypes] = useState([])
  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return
    if (!silent) setBusy(true)
    try {
      const { clients: c, trainings: t, memByClient: map } = await loadTrainerWorkspaceSnapshot(user.id, trainerClubId)
      setClients(c)
      setTrainings(t)
      setMemByClient(map)
    } finally {
      if (!silent) setBusy(false)
    }
  }, [user?.id, trainerClubId])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void reload({ silent: true })
    if (isSupabaseConfigured() && isAppOnline()) {
      void (async () => {
        await pullTrainerWorkspaceFromCloud(user.id)
        if (cancelled) return
        invalidateTrainerWorkspaceCache()
        await reload({ silent: true })
      })()
    }
    return () => {
      cancelled = true
    }
  }, [user?.id, trainerClubId, reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  useEffect(() => {
    if (!trainerClubId) {
      setMembershipTypes([])
      return
    }
    void listMembershipTypesForClub(trainerClubId).then(setMembershipTypes)
  }, [trainerClubId])

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])
  const today = todayLocalIso()

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
    let starsSum = 0
    let starsN = 0
    for (const t of done) {
      const s = Number(t.data?.stars)
      if (!Number.isNaN(s) && s > 0) {
        starsSum += s
        starsN += 1
      }
    }
    return {
      workouts: done.length,
      clients: clients.length,
      avgStars: starsN ? (starsSum / starsN).toFixed(1) : '—',
    }
  }, [trainings, clients, user?.id, range])

  const draftTrainings = useMemo(() => trainings.filter((t) => t.status === 'draft'), [trainings])

  const createClient = async (e) => {
    e.preventDefault()
    if (!newClientForm.name.trim()) {
      alert('Укажите имя')
      return
    }
    let clubId = trainerClubId
    if (!clubId) {
      const profile = await refreshUserProfile()
      clubId = profile?.club_id ?? null
    }
    if (!clubId) {
      alert(
        'Тренер не привязан к клубу. Админ: Структура → Тренеры → выберите клуб. Затем выйдите и войдите снова (или Ctrl+F5).',
      )
      return
    }
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = {
      id,
      trainer_id: user.id,
      club_id: clubId,
      name: formatClientName(newClientForm.name),
      phone: newClientForm.phone.trim() || null,
      birth_date: newClientForm.birth_date || null,
      created_at: now,
    }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'insert', remote_id: null })
      if (supabaseReady) {
        await flushSyncQueue({ force: true, maxMs: 20_000 })
      }
    } catch (err) {
      alert(err?.message ?? 'Ошибка создания клиента')
      return
    }
    setShowNewClient(false)
    setNewClientForm({ name: '', phone: '', birth_date: '' })
    await reload()
  }

  return (
    <div className="grid stagger td-grid">
      <div className="row td-top">
        <div className="u-grow u-minw-0 td-top__grow">
          <h1 className="section-title td-top__title">
            Главная тренера
          </h1>
          <p className="section-sub td-top__sub">
            <span className="pill-offline" data-on={online}>
              {online ? 'Онлайн' : 'Офлайн'}
            </span>
            <span>
              <strong>{user?.name ?? user?.email ?? 'Тренер'}</strong>
              {' · '}статистика за период
            </span>
          </p>
        </div>
        <div className="row td-actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => void reload()}>
            <RefreshCw size={18} className={busy ? 'icon-spin' : undefined} aria-hidden />
            Обновить
          </button>
          <button type="button" className="btn btn-ghost btn-touch" onClick={() => signOut()}>
            <LogOut size={18} aria-hidden />
            Выйти
          </button>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title td-period__title">
          Период
        </h2>
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
        <div className="card stat-card">
          <div className="stat-card__top">
            <h3 className="td-stat-title">Средняя оценка</h3>
          </div>
          <p className="stat-card__value td-avg">
            {stats.avgStars}
            <span className="muted td-avg-note">
              {' '}
              (звёзды из формы)
            </span>
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title td-section-title">По типам абонементов</h2>
        <MembershipTypeStatsBlock byType={typeStats.byType} showTrainerBreakdown={false} />
      </section>

      <section id="drafts" className="card">
        <div className="row">
          <h2 className="section-title td-section-title">
            Активные тренировки
          </h2>
          <span className="badge badge-warn">{draftTrainings.length}</span>
        </div>
        <p className="muted">Черновики — нажмите карточку, чтобы продолжить.</p>
        <ul className="list">
          {draftTrainings.map((t) => (
            <li key={t.id}>
              <Link to={`/trainer/workouts/${t.id}`} className="list-item td-draft-link">
                <div>
                  <strong>Черновик</strong>
                  <div className="muted td-muted-13">
                    {formatDateRu(t.date)} · {t.type ?? '—'}
                  </div>
                </div>
                <span className="btn btn-primary btn-touch td-no-pointer">
                  Открыть
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="clients" className="card">
        <div className="row">
          <h2 className="section-title td-section-title">
            Клиенты
          </h2>
          <button type="button" className="btn btn-primary btn-touch" onClick={() => setShowNewClient(true)}>
            <UserPlus size={18} aria-hidden />
            Новый клиент
          </button>
        </div>
        <ul className="list">
          {clients.map((c) => {
            const mlist = memByClient[c.id] ?? []
            const active = pickUsableMembershipForDate(mlist, today)
            const sig = membershipSignal(mlist, today)
            const last = lastTrainingDate(trainings, c.id)
            return (
              <li key={c.id} className="list-item td-client-item">
                <div className="row td-client-row">
                  <div className="td-client-left">
                    <span title={sig.label} className="td-client-dot" style={{ background: sig.color }} />
                    <div>
                      <strong>{c.name}</strong>
                      <div className="muted td-muted-13">
                        {c.phone ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div className="row td-client-actions">
                    {active ? (
                      <Link
                        to={`/trainer/workouts/new?clientId=${c.id}`}
                        className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                        aria-label="Новая тренировка"
                        title="Новая тренировка"
                      >
                        <Dumbbell size={20} aria-hidden />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-icon-square btn-touch u-opacity-55 u-pointer-auto"
                        aria-disabled="true"
                        aria-label="Новая тренировка"
                        title="Нет действующего абонемента"
                        onClick={() => alert('Нет действующего абонемента')}
                      >
                        <Dumbbell size={20} aria-hidden />
                      </button>
                    )}
                    <Link
                      to={`/trainer/clients/${c.id}`}
                      className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                      aria-label="Карточка клиента"
                      title="Карточка клиента"
                    >
                      <UserCircle size={20} aria-hidden />
                    </Link>
                  </div>
                </div>
                <div className="muted td-muted-row">
                  {active ? (
                    <>
                      <span>
                        Абонемент до <strong>{formatDateRu(active.end_date)}</strong>
                      </span>
                      <span>
                        Использовано:{' '}
                        <strong>
                          {active.used_trainings ?? 0}/{active.total_trainings ?? '—'}
                        </strong>
                      </span>
                    </>
                  ) : (
                    <span>Абонемент: нет активного</span>
                  )}
                  <span>
                    Последняя тренировка: <strong>{last}</strong>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {showNewClient && (
        <div className="modal-overlay" onClick={() => setShowNewClient(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="section-title">Новый клиент</h2>
            <form onSubmit={createClient} className="grid td-modal-form">
              <div className="field">
                <label className="label">ФИО *</label>
                <input
                  className="input"
                  required
                  value={newClientForm.name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => setNewClientForm((f) => ({ ...f, name: formatClientName(f.name) }))}
                  placeholder="Фамилия Имя Отчество или Фамилия И.О."
                />
              </div>
              <div className="field">
                <label className="label">Телефон</label>
                <input className="input" value={newClientForm.phone} onChange={(e) => setNewClientForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Дата рождения</label>
                <input className="input" type="date" value={newClientForm.birth_date} onChange={(e) => setNewClientForm((f) => ({ ...f, birth_date: e.target.value }))} />
              </div>
              <div className="row td-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewClient(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
