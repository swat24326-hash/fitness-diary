import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Cake, CalendarClock, Clock, MessageCircle, Search, UserPlus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { TrainerClientListItem } from '../../components/trainer/TrainerClientListItem'
import { useAuth } from '../../context/AuthContext'
import { useTrainerOutreach } from '../../hooks/useTrainerOutreach'
import { deleteClientAndAllData, listClubsLocal } from '../../lib/dataAccess'
import { membershipSignal } from '../../lib/clientListSignals'
import { CLIENT_LIST_PAGE_SIZE } from '../../lib/clientListPagination'
import { todayLocalIso } from '../../lib/dateRu'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import { pullTrainerWorkspaceFromCloud } from '../../lib/trainerPullService'
import { isAppOnline } from '../../lib/syncService'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { flushSyncQueue, saveLocalWithSync } from '../../lib/syncService'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  isBirthdayToday,
  isMembershipExpiredRecently,
  isOutreachScenario,
  resolveOutreachTemplates,
} from '../../lib/trainer/trainerClientOutreachCore'
import {
  buildLastCompletedTrainingDateByClientId,
  isClientStaleForAttention,
  normalizeTrainerClientQuickFilter,
  STALE_TRAINING_DAYS,
} from '../../lib/trainer/trainerAttentionSummary'
import {
  listOutreachLogTodayByScenario,
  loadCachedClubOutreachTemplates,
} from '../../lib/trainer/trainerOutreachLogService'

export function TrainerClients() {
  const { user, refreshUserProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const trainerClubId = user?.club_id ?? null

  useEffect(() => {
    if (user?.id && !user?.club_id) void refreshUserProfile()
  }, [user?.id, user?.club_id, refreshUserProfile])
  const [clients, setClients] = useState([])
  const [archivedClients, setArchivedClients] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [trainingsByClientId, setTrainingsByClientId] = useState({})
  const [lastTrainingDateByClientId, setLastTrainingDateByClientId] = useState({})
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const filterFromUrl = searchParams.get('filter')
  const [quickFilter, setQuickFilter] = useState(() => normalizeTrainerClientQuickFilter(filterFromUrl) ?? 'all')
  const [clientsTab, setClientsTab] = useState('active')
  const [visibleCount, setVisibleCount] = useState(CLIENT_LIST_PAGE_SIZE)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', birth_date: '', card_number: '' })
  const [clubs, setClubs] = useState([])
  const [outreachTemplatesRaw, setOutreachTemplatesRaw] = useState(null)
  const [typeNameById, setTypeNameById] = useState({})
  const [sentTodayIds, setSentTodayIds] = useState(() => new Set())
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [toast, setToast] = useState(null)

  const formatClientName = (raw) => {
    const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
    if (!s) return ''
    const parts = s.split(' ').filter(Boolean)
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

    const last = cap(parts[0])
    const rest = parts.slice(1)
    const toInitials = (x) => {
      const t = String(x ?? '').replace(/\./g, '').trim()
      if (!t) return ''
      if (t.length >= 2 && /^[A-Za-zА-Яа-я]+$/.test(t) && t === t.toUpperCase()) {
        return t
          .slice(0, 2)
          .split('')
          .map((ch) => `${ch}.`)
          .join('')
      }
      if (t.length === 1) return `${t.toUpperCase()}.`
      return cap(t)
    }

    if (rest.length === 0) return last
    if (rest.length === 1) return `${last} ${toInitials(rest[0])}`.trim()
    if (rest.length >= 2) return `${last} ${toInitials(rest[0])}${toInitials(rest[1])}`.trim()
    return s
  }

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return
    if (!silent) setBusy(true)
    try {
      const snap = await loadTrainerWorkspaceSnapshot(user.id, trainerClubId)
      setClients(snap.clients)
      setArchivedClients(snap.archivedClients ?? [])
      setMemByClient(snap.memByClient)
      setTrainingsByClientId(snap.trainingsByClientId)
      setLastTrainingDateByClientId(snap.lastTrainingDateByClientId)
      setClubs(await listClubsLocal())
      if (trainerClubId) {
        setOutreachTemplatesRaw(await loadCachedClubOutreachTemplates(trainerClubId))
        const types = await listMembershipTypesForClub(trainerClubId)
        setTypeNameById(Object.fromEntries(types.map((t) => [String(t.id), String(t.code ?? t.name ?? 'абонемент')])))
      }
    } finally {
      if (!silent) setBusy(false)
      setWorkspaceReady(true)
    }
  }, [user?.id, trainerClubId])

  useEffect(() => {
    if (!user?.id) {
      setWorkspaceReady(false)
      return
    }
    let cancelled = false
    setWorkspaceReady(false)
    void reload({ silent: true })
    if (isSupabaseConfigured() && isAppOnline()) {
      void (async () => {
        await pullTrainerWorkspaceFromCloud(user.id)
        if (cancelled) return
        await reload({ silent: true })
      })()
    }
    return () => {
      cancelled = true
    }
  }, [user?.id, trainerClubId, reload])

  useEffect(() => {
    if (clientsTab !== 'archive') return
    if (!user?.id) return
    if (!isSupabaseConfigured() || !isAppOnline()) return
    void (async () => {
      await pullTrainerWorkspaceFromCloud(user.id, { mode: 'archive' })
      await reload({ silent: true })
    })()
  }, [clientsTab, archivedClients.length, user?.id, reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  useEffect(() => {
    const f = normalizeTrainerClientQuickFilter(searchParams.get('filter'))
    if (f) setQuickFilter(f)
  }, [searchParams])

  const lastCompletedByClientId = useMemo(
    () => buildLastCompletedTrainingDateByClientId(Object.values(trainingsByClientId).flat()),
    [trainingsByClientId],
  )

  const today = todayLocalIso()

  const myClubName = useMemo(() => {
    if (!trainerClubId) return null
    return clubs.find((x) => x.id === trainerClubId)?.name ?? null
  }, [clubs, trainerClubId])

  const outreachTemplates = useMemo(() => resolveOutreachTemplates(outreachTemplatesRaw), [outreachTemplatesRaw])

  const showToast = useCallback((msg, tone = 'info') => {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const outreach = useTrainerOutreach({
    userId: user?.id,
    trainerName: user?.name,
    clubId: trainerClubId,
    clubName: myClubName,
    outreachTemplates,
    typeNameById,
    onFeedback: showToast,
  })

  const clientMatchesFilter = useCallback(
    (c, filterId) => {
      const memList = memByClient[c.id] ?? []
      if (filterId === 'birthdays') return isBirthdayToday(c.birth_date, today)
      if (filterId === 'expiring') return membershipSignal(memList, today).key === 'expiring'
      if (filterId === 'expired_recent') return isMembershipExpiredRecently(memList, today)
      if (filterId === 'stale') {
        return isClientStaleForAttention({
          memList,
          lastCompletedIso: lastCompletedByClientId[c.id],
          today,
          staleDays: STALE_TRAINING_DAYS,
        })
      }
      return false
    },
    [memByClient, today, lastCompletedByClientId],
  )

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = clientsTab === 'archive' ? archivedClients : clients
    const base = !q
      ? source
      : source.filter((c) => {
          const name = String(c.name ?? '').toLowerCase()
          const phone = String(c.phone ?? '').toLowerCase()
          const card = String(c.card_number ?? '').toLowerCase()
          return name.includes(q) || phone.includes(q) || card.includes(q)
        })

    if (quickFilter === 'all') return base
    return base.filter((c) => clientMatchesFilter(c, quickFilter))
  }, [clients, archivedClients, clientsTab, query, quickFilter, clientMatchesFilter])

  useEffect(() => {
    setVisibleCount(CLIENT_LIST_PAGE_SIZE)
  }, [query, quickFilter, clients.length, archivedClients.length, clientsTab])

  const visibleClients = useMemo(
    () => filteredClients.slice(0, visibleCount),
    [filteredClients, visibleCount],
  )
  const hasMore = filteredClients.length > visibleCount

  const filterCounts = useMemo(() => {
    const base = clientsTab === 'archive' ? archivedClients : clients
    const all = base.length
    let expiring = 0
    let expired_recent = 0
    let birthdays = 0
    let stale = 0
    for (const c of base) {
      if (clientMatchesFilter(c, 'expiring')) expiring++
      if (clientMatchesFilter(c, 'expired_recent')) expired_recent++
      if (clientMatchesFilter(c, 'birthdays')) birthdays++
      if (clientMatchesFilter(c, 'stale')) stale++
    }
    return { all, expiring, expired_recent, birthdays, stale }
  }, [clients, archivedClients, clientsTab, clientMatchesFilter])

  useEffect(() => {
    if (!user?.id || !isOutreachScenario(quickFilter)) {
      setSentTodayIds(new Set())
      return
    }
    let alive = true
    void (async () => {
      const rows = await listOutreachLogTodayByScenario(user.id, quickFilter, today)
      if (!alive) return
      setSentTodayIds(new Set(rows.map((r) => String(r.client_id))))
    })()
    return () => {
      alive = false
    }
  }, [user?.id, quickFilter, today, outreach.copiedClientId])

  const outreachQueue = useMemo(() => {
    if (!isOutreachScenario(quickFilter)) return { pending: [], total: 0, done: 0 }
    const withPhone = filteredClients.filter((c) => String(c.phone ?? '').trim())
    const pending = withPhone.filter((c) => !sentTodayIds.has(String(c.id)))
    return { pending, total: withPhone.length, done: withPhone.length - pending.length }
  }, [filteredClients, quickFilter, sentTodayIds])

  const filterBtnClass = (id) => `btn ${quickFilter === id ? 'btn-primary' : 'btn-ghost'} btn-icon-square`

  const applyFilter = (id) => {
    setQuickFilter((cur) => (cur === id ? 'all' : id))
  }

  const handleNextOutreach = useCallback(async () => {
    const next = outreachQueue.pending[0]
    if (!next || !isOutreachScenario(quickFilter)) return
    await outreach.handleWriteToMax({
      client: next,
      scenario: quickFilter,
      memList: memByClient[next.id] ?? [],
      today,
    })
    setSentTodayIds((prev) => new Set([...prev, String(next.id)]))
  }, [outreach, outreachQueue.pending, quickFilter, memByClient, today])

  const updateClientArchiveFlag = async (clientRow, archived) => {
    if (!clientRow?.id) return
    setBusy(true)
    try {
      const row = { ...clientRow, archived_at: archived ? new Date().toISOString() : null }
      await saveLocalWithSync('clients', row, {
        table_name: 'clients',
        operation: 'update',
        remote_id: row.id,
        data: row,
      })
      await flushSyncQueue()
      await reload({ silent: true })
    } catch (err) {
      alert(err?.message ?? 'Не удалось обновить архив')
    } finally {
      setBusy(false)
    }
  }

  const createClient = async (e) => {
    e.preventDefault()
    if (!user?.id || !trainerClubId) {
      alert('Клуб не назначен — попросите администратора назначить клуб в профиле.')
      return
    }
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const row = {
        id,
        trainer_id: user.id,
        club_id: trainerClubId,
        name: formatClientName(newClientForm.name),
        phone: newClientForm.phone.trim() || null,
        birth_date: newClientForm.birth_date || null,
        card_number: String(newClientForm.card_number ?? '').trim() || null,
        created_at: now,
      }
      await saveLocalWithSync('clients', row, {
        table_name: 'clients',
        operation: 'insert',
        remote_id: id,
        data: row,
      })
      await flushSyncQueue()
      setShowNewClient(false)
      setNewClientForm({ name: '', phone: '', birth_date: '', card_number: '' })
      await reload()
    } catch (err) {
      alert(err?.message ?? 'Не удалось создать клиента')
    } finally {
      setBusy(false)
    }
  }

  const runDeleteClient = async () => {
    if (!confirmDelete?.id) return
    setBusy(true)
    try {
      await deleteClientAndAllData(confirmDelete.id)
      setConfirmDelete(null)
      await reload()
    } catch (err) {
      alert(err?.message ?? 'Не удалось удалить клиента')
    } finally {
      setBusy(false)
    }
  }

  const emptyFilterMessage = () => {
    if (quickFilter === 'birthdays') return 'Сегодня дней рождения нет (укажите дату в карточке клиента).'
    if (quickFilter === 'expiring') return 'Нет абонементов, которые заканчиваются через 1–3 дня.'
    if (quickFilter === 'expired_recent') return 'Нет абонементов, закончившихся сегодня или вчера.'
    if (quickFilter === 'stale') {
      return `Нет клиентов без завершённой тренировки ${STALE_TRAINING_DAYS}+ дней (с действующим абонементом).`
    }
    return 'Ничего не найдено.'
  }

  return (
    <div className="grid stagger td-grid">
      {toast ? (
        <div className={`trainer-outreach-toast trainer-outreach-toast--${toast.tone}`} role="status">
          {toast.msg}
        </div>
      ) : null}

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Поиск
          </h2>
          <div className="u-grow u-minw-0" style={{ maxWidth: 680, width: '100%' }}>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
              <Search size={18} aria-hidden className="u-shrink-0" />
              <input className="input u-w-full" placeholder="Фамилия, телефон или номер карты…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button
                type="button"
                className={filterBtnClass('expiring')}
                onClick={() => applyFilter('expiring')}
                aria-label="Фильтр: абонемент заканчивается через 1–3 дня"
                title={`1–3 дня (${filterCounts.expiring})`}
              >
                <Clock size={20} aria-hidden />
              </button>
              <button
                type="button"
                className={filterBtnClass('expired_recent')}
                onClick={() => applyFilter('expired_recent')}
                aria-label="Фильтр: абонемент закончился сегодня или вчера"
                title={`Закончился (${filterCounts.expired_recent})`}
              >
                <AlertTriangle size={20} aria-hidden />
              </button>
              <button
                type="button"
                className={filterBtnClass('birthdays')}
                onClick={() => applyFilter('birthdays')}
                aria-label="Фильтр: день рождения сегодня"
                title={`ДР сегодня (${filterCounts.birthdays})`}
              >
                <Cake size={20} aria-hidden />
              </button>
              <button
                type="button"
                className={filterBtnClass('stale')}
                onClick={() => applyFilter('stale')}
                aria-label={`Фильтр: без завершённой тренировки ${STALE_TRAINING_DAYS}+ дней`}
                title={`Давно не был (${filterCounts.stale})`}
              >
                <CalendarClock size={20} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="clients" className="card">
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Список
          </h2>
          <div className="row td-actions">
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch"
              onClick={() => setShowNewClient(true)}
              aria-label="Добавить нового клиента"
              title="Новый клиент"
            >
              <UserPlus size={20} aria-hidden />
            </button>
          </div>
        </div>

        {isOutreachScenario(quickFilter) && filteredClients.length > 0 ? (
          <div className="trainer-outreach-queue">
            <button
              type="button"
              className="btn btn-primary btn-touch trainer-outreach-queue__btn"
              disabled={!outreachQueue.pending.length || busy}
              onClick={() => void handleNextOutreach()}
            >
              <MessageCircle size={18} aria-hidden />
              {outreachQueue.pending.length
                ? `Следующий (${outreachQueue.done + 1} из ${outreachQueue.total})`
                : `Все обработаны (${outreachQueue.total})`}
            </button>
            <p className="muted trainer-outreach-queue__hint">
              Текст копируется в буфер, затем открывается Max. Выберите чат с клиентом и отправьте сообщение.
            </p>
          </div>
        ) : null}

        <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
          <button type="button" className="tab" aria-selected={clientsTab === 'active'} onClick={() => setClientsTab('active')}>
            Активные ({clients.length})
          </button>
          <button type="button" className="tab" aria-selected={clientsTab === 'archive'} onClick={() => setClientsTab('archive')}>
            Архив ({archivedClients.length})
          </button>
        </div>
        {!workspaceReady ? (
          <div className="td-list-loading" role="status" aria-live="polite" aria-busy="true">
            <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
            <p className="muted td-list-loading__text">Загрузка клиентов…</p>
          </div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px', lineHeight: 1.45 }}>
              {trainerClubId ? (
                <>
                  Клуб: <strong>{myClubName ?? 'ваш клуб'}</strong>. Вы видите только своих клиентов этого клуба.
                </>
              ) : (
                <>
                  Клуб не назначен. Клиенты скрыты, создание тренировки/клиентов недоступно — попросите админа назначить клуб.
                </>
              )}
            </p>
            {filteredClients.length > 0 ? (
              <>
                <p className="muted client-list-meta">
                  Показано {visibleClients.length} из {filteredClients.length}
                  {clients.length !== filteredClients.length ? ` (всего у вас ${clients.length})` : ''}
                </p>
                <ul className="list">
                  {visibleClients.map((c) => (
                    <TrainerClientListItem
                      key={c.id}
                      client={c}
                      today={today}
                      memList={memByClient[c.id] ?? []}
                      clientTrainings={trainingsByClientId[c.id] ?? []}
                      lastTrainingIso={lastCompletedByClientId[c.id] ?? lastTrainingDateByClientId[c.id] ?? '—'}
                      showBirthdayLabel={quickFilter === 'birthdays'}
                      outreachScenario={isOutreachScenario(quickFilter) ? quickFilter : null}
                      onWriteToMax={
                        isOutreachScenario(quickFilter)
                          ? () =>
                              outreach.handleWriteToMax({
                                client: c,
                                scenario: quickFilter,
                                memList: memByClient[c.id] ?? [],
                                today,
                              })
                          : null
                      }
                      outreachCopied={outreach.copiedClientId === c.id}
                      outreachBusy={outreach.busyClientId === c.id}
                      mode={clientsTab}
                      busy={busy}
                      onDelete={(row) => setConfirmDelete({ id: row.id, name: row.name })}
                      onArchive={(row) => void updateClientArchiveFlag(row, true)}
                      onRestore={(row) => void updateClientArchiveFlag(row, false)}
                    />
                  ))}
                </ul>
                {hasMore ? (
                  <div className="client-list-more">
                    <button type="button" className="btn btn-ghost btn-touch" onClick={() => setVisibleCount((n) => n + CLIENT_LIST_PAGE_SIZE)}>
                      Показать ещё {Math.min(CLIENT_LIST_PAGE_SIZE, filteredClients.length - visibleCount)}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">
                {quickFilter !== 'all' || query.trim()
                  ? emptyFilterMessage()
                  : clients.length === 0
                    ? 'Пока нет клиентов. Нажмите «+», чтобы добавить.'
                    : 'Ничего не найдено.'}
              </p>
            )}
          </>
        )}
      </section>

      {confirmDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-client-title" onClick={() => !busy && setConfirmDelete(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-client-title" className="section-title" style={{ marginTop: 0 }}>
              Удалить клиента?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Действительно удаляем <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>?
            </p>
            <p className="muted" style={{ marginTop: 10, fontSize: '0.9rem' }}>
              Безвозвратно удалятся все тренировки, абонементы, замеры тела и медкарта этого клиента.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button type="button" className="btn btn-touch" style={{ background: 'rgba(248,113,113,0.2)', borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }} disabled={busy} onClick={() => void runDeleteClient()}>
                {busy ? 'Удаление…' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  placeholder="Фамилия И.О. (или Фамилия Имя)"
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
              <div className="field">
                <label className="label">Номер карты</label>
                <input className="input" value={newClientForm.card_number} onChange={(e) => setNewClientForm((f) => ({ ...f, card_number: e.target.value }))} />
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
