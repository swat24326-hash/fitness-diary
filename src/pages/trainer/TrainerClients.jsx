import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, SkipForward, UserPlus, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { TrainerClientListItem } from '../../components/trainer/TrainerClientListItem'
import {
  TRAINER_CLIENTS_BROWSE_LABELS,
  TrainerClientsBrowseFilters,
} from '../../components/trainer/TrainerClientsBrowseFilters.jsx'
import { useAuth } from '../../context/AuthContext'
import { useTrainerOutreach } from '../../hooks/useTrainerOutreach'
import { deleteClientAndAllData, listClubsLocal } from '../../lib/dataAccess'
import { ClientHardDeleteConfirmModal } from '../../components/ClientHardDeleteConfirmModal.jsx'
import { membershipSignal } from '../../lib/clientListSignals'
import { CLIENT_LIST_PAGE_SIZE } from '../../lib/clientListPagination'
import { todayLocalIso } from '../../lib/dateRu'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import { pullTrainerWorkspaceFromCloud } from '../../lib/trainerPullService'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  isAppOnline,
  saveLocalWithSync,
} from '../../lib/syncService'
import { isSupabaseConfigured } from '../../lib/supabase'
import { formatClientName } from '../../lib/clientNameFormat'
import {
  isBirthdayToday,
  isMembershipExpiredRecently,
  isOutreachScenario,
  normalizeOutreachName,
  normalizeMaxChatUrl,
  resolveOutreachTemplates,
} from '../../lib/trainer/trainerClientOutreachCore'
import {
  buildLastCompletedTrainingDateByClientId,
  isClientStaleForAttention,
  normalizeTrainerClientQuickFilter,
  STALE_TRAINING_DAYS,
  STALE_MAX_DAYS,
} from '../../lib/trainer/trainerAttentionSummary'
import {
  buildOutreachScenarioHint,
  pickNextOutreachClient,
  sortClientsForOutreachFilter,
} from '../../lib/trainer/trainerOutreachQueue'
import {
  listOutreachLogTodayByScenario,
  loadCachedClubOutreachTemplates,
} from '../../lib/trainer/trainerOutreachLogService'
import { withPnkFieldsForInsert } from '../../lib/pnk/pnkLocalService'
import { assertClubCardAvailableForCreate } from '../../lib/admin/salesClientMatchCore.js'
import { listClientsByClubId } from '../../lib/localDbClubQuery.js'
import '../../styles/trainer-clients.css'

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
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    phone: '',
    birth_date: '',
    card_number: '',
    outreach_name: '',
    max_chat_url: '',
    as_pnk: false,
    pnk_trial_sessions: 1,
  })
  const [clubs, setClubs] = useState([])
  const [outreachTemplatesRaw, setOutreachTemplatesRaw] = useState(null)
  const [typeNameById, setTypeNameById] = useState({})
  const [sentTodayIds, setSentTodayIds] = useState(() => new Set())
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [highlightClientId, setHighlightClientId] = useState(null)

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
      if (filterId === 'pnk') return String(c.lifecycle ?? '') === 'pnk'
      if (filterId === 'birthdays') return isBirthdayToday(c.birth_date, today)
      if (filterId === 'expiring') return membershipSignal(memList, today).key === 'expiring'
      if (filterId === 'expired_recent') return isMembershipExpiredRecently(memList, today)
      if (filterId === 'stale') {
        return isClientStaleForAttention({
          memList,
          today,
          staleDays: STALE_TRAINING_DAYS,
          staleMaxDays: STALE_MAX_DAYS,
        })
      }
      return false
    },
    [memByClient, today],
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

  const sortedFilteredClients = useMemo(() => {
    if (!isOutreachScenario(quickFilter)) return filteredClients
    return sortClientsForOutreachFilter(filteredClients, quickFilter, memByClient, sentTodayIds, today)
  }, [filteredClients, quickFilter, memByClient, sentTodayIds, today])

  const nextOutreachClient = useMemo(() => {
    if (!isOutreachScenario(quickFilter)) return null
    return pickNextOutreachClient(sortedFilteredClients, sentTodayIds)
  }, [sortedFilteredClients, quickFilter, sentTodayIds])

  useEffect(() => {
    setVisibleCount(CLIENT_LIST_PAGE_SIZE)
  }, [query, quickFilter, clients.length, archivedClients.length, clientsTab])

  const visibleClients = useMemo(
    () => sortedFilteredClients.slice(0, visibleCount),
    [sortedFilteredClients, visibleCount],
  )
  const hasMore = sortedFilteredClients.length > visibleCount

  const filterCounts = useMemo(() => {
    const base = clientsTab === 'archive' ? archivedClients : clients
    const all = base.length
    let expiring = 0
    let expired_recent = 0
    let birthdays = 0
    let stale = 0
    let pnk = 0
    for (const c of base) {
      if (clientMatchesFilter(c, 'expiring')) expiring++
      if (clientMatchesFilter(c, 'expired_recent')) expired_recent++
      if (clientMatchesFilter(c, 'birthdays')) birthdays++
      if (clientMatchesFilter(c, 'stale')) stale++
      if (clientMatchesFilter(c, 'pnk')) pnk++
    }
    return { all, expiring, expired_recent, birthdays, stale, pnk }
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

  const outreachProgress = useMemo(() => {
    if (!isOutreachScenario(quickFilter)) return { pending: 0, total: 0, done: 0 }
    const withPhone = sortedFilteredClients.filter((c) => String(c.phone ?? '').trim())
    const pending = withPhone.filter((c) => !sentTodayIds.has(String(c.id)))
    return { pending: pending.length, total: withPhone.length, done: withPhone.length - pending.length }
  }, [sortedFilteredClients, quickFilter, sentTodayIds])

  const scrollToOutreachClient = useCallback(
    (clientId) => {
      if (!clientId) return
      const idx = sortedFilteredClients.findIndex((c) => String(c.id) === String(clientId))
      if (idx >= 0 && idx >= visibleCount) {
        setVisibleCount(idx + 1)
      }
      setHighlightClientId(String(clientId))
      window.setTimeout(() => {
        document.getElementById(`trainer-client-${clientId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      window.setTimeout(() => setHighlightClientId(null), 2600)
    },
    [sortedFilteredClients, visibleCount],
  )

  const handleNextOutreach = useCallback(() => {
    if (!nextOutreachClient) {
      showToast('Все обработаны', 'info')
      return
    }
    scrollToOutreachClient(nextOutreachClient.id)
  }, [nextOutreachClient, scrollToOutreachClient, showToast])

  const applyFilter = (id) => {
    if (id === 'all') {
      setQuickFilter('all')
      return
    }
    setQuickFilter((cur) => (cur === id ? 'all' : id))
  }

  const clearBrowseFilter = () => {
    setQuickFilter('all')
    setQuery('')
  }

  const activeBrowseLabel =
    quickFilter && quickFilter !== 'all' ? TRAINER_CLIENTS_BROWSE_LABELS[quickFilter] ?? null : null

  const updateClientArchiveFlag = async (clientRow, archived) => {
    if (!clientRow?.id) return
    setBusy(true)
    try {
      const row = { ...clientRow, archived_at: archived ? new Date().toISOString() : null }
      await saveLocalWithSync('clients', row, {
        table_name: 'clients',
        operation: 'update',
        remote_id: row.id,
      })
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, archived ? 'Архив' : 'Возврат из архива')
      if (warn) alert(warn)
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
    const cardRaw = String(newClientForm.card_number ?? '').trim() || null
    if (cardRaw) {
      let pool = [...clients, ...archivedClients]
      try {
        const clubWide = await listClientsByClubId(trainerClubId)
        if (clubWide?.length) pool = clubWide
      } catch {
        /* офлайн — проверяем хотя бы своих */
      }
      const cardCheck = assertClubCardAvailableForCreate(pool, trainerClubId, cardRaw)
      if (!cardCheck.ok) {
        alert(cardCheck.error)
        return
      }
    }
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const rowBase = {
        id,
        trainer_id: user.id,
        club_id: trainerClubId,
        name: formatClientName(newClientForm.name),
        phone: newClientForm.phone.trim() || null,
        birth_date: newClientForm.birth_date || null,
        card_number: cardRaw,
        outreach_name: normalizeOutreachName(newClientForm.outreach_name) || null,
        max_chat_url: normalizeMaxChatUrl(newClientForm.max_chat_url) || null,
        created_at: now,
        ...(newClientForm.as_pnk
          ? { pnk_trial_sessions: Number(newClientForm.pnk_trial_sessions) === 2 ? 2 : 1 }
          : {}),
      }
      const row = newClientForm.as_pnk ? withPnkFieldsForInsert(rowBase, 'trainer') : rowBase
      await saveLocalWithSync('clients', row, {
        table_name: 'clients',
        operation: 'insert',
        remote_id: id,
      })
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Новый клиент')
      if (warn) alert(warn)
      setShowNewClient(false)
      setNewClientForm({
        name: '',
        phone: '',
        birth_date: '',
        card_number: '',
        outreach_name: '',
        max_chat_url: '',
        as_pnk: false,
        pnk_trial_sessions: 1,
      })
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
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Удаление')
      if (warn) alert(warn)
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
    if (quickFilter === 'expired_recent') {
      return `Нет абонементов, закончившихся за последние ${STALE_TRAINING_DAYS - 1} дней.`
    }
    if (quickFilter === 'stale') {
      return `Нет клиентов, у которых абонемент закончился ${STALE_TRAINING_DAYS}–${STALE_MAX_DAYS} дней назад.`
    }
    if (quickFilter === 'pnk') return 'Нет клиентов в воронке ПНК.'
    return 'Нет клиентов по фильтру.'
  }

  return (
    <div className="grid stagger td-grid">
      {toast ? (
        <div className={`trainer-outreach-toast trainer-outreach-toast--${toast.tone}`} role="status">
          {toast.msg}
        </div>
      ) : null}

      <header className="trainer-path-head">
        <div className="trainer-path-head__left">
          <h1 className="trainer-path-head__title">Клиенты</h1>
          <p className="trainer-path-head__lead">Найти клиента и открыть карточку. Очереди Max — чипами ниже.</p>
        </div>
      </header>

      <section className="card admin-clients-workspace trainer-clients-workspace" id="clients">
        <div className="admin-clients-workspace__toolbar">
          <div className="admin-clients-segment" role="tablist" aria-label="Раздел списка клиентов">
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'active'}
              onClick={() => setClientsTab('active')}
            >
              Активные
              <span className="admin-clients-segment__count">{clients.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'archive'}
              onClick={() => {
                setClientsTab('archive')
                setQuickFilter('all')
              }}
            >
              Архив
              <span className="admin-clients-segment__count">{archivedClients.length}</span>
            </button>
          </div>
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

        <p className="muted admin-clients-workspace__meta">
          {trainerClubId ? (
            <>
              Только ваши клиенты · <strong>{myClubName ?? 'клуб'}</strong>
            </>
          ) : (
            <>Клуб не назначен — список и «+» недоступны. Попросите админа назначить клуб.</>
          )}
        </p>

        <div className="admin-clients-workspace__search" role="group" aria-label="Поиск клиента">
          <div className="admin-clients-search-cell">
            <Search size={18} aria-hidden className="muted u-shrink-0" />
            <input
              className="admin-clients-search-input"
              type="search"
              autoComplete="off"
              placeholder="Фамилия, телефон или номер карты…"
              aria-label="Поиск по клиенту"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {clientsTab === 'active' ? (
          <TrainerClientsBrowseFilters counts={filterCounts} quickFilter={quickFilter} onApply={applyFilter} />
        ) : (
          <p className="admin-clients-workspace__archive-hint muted">
            Архивные карточки: просмотр и возврат. Поиск по имени, телефону или карте.
          </p>
        )}

        <div className="admin-clients-workspace__results">
          {isOutreachScenario(quickFilter) && sortedFilteredClients.length > 0 ? (
            <div
              className={`trainer-outreach-progress${outreachProgress.pending === 0 && outreachProgress.total > 0 ? ' trainer-outreach-progress--done' : ''}`}
              role="status"
              aria-live="polite"
              title={
                nextOutreachClient
                  ? `Следующий: ${nextOutreachClient.name}`
                  : outreachProgress.pending === 0
                    ? 'Все обработаны'
                    : undefined
              }
            >
              <strong className="trainer-outreach-progress__count">
                {outreachProgress.done}/{outreachProgress.total}
              </strong>
              {outreachProgress.pending > 0 && nextOutreachClient ? (
                <button
                  type="button"
                  className="btn btn-primary btn-icon-square btn-touch trainer-outreach-next-btn"
                  onClick={handleNextOutreach}
                  aria-label={`Следующий: ${nextOutreachClient.name}`}
                  title={`Следующий: ${nextOutreachClient.name}`}
                >
                  <SkipForward size={20} aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}

          {activeBrowseLabel || query.trim() ? (
            <div className="admin-clients-results-bar">
              <span className="admin-clients-results-bar__label">
                Показано:{' '}
                <strong>{activeBrowseLabel || 'поиск'}</strong>
                {sortedFilteredClients.length > 0 ? (
                  <span className="muted"> · {sortedFilteredClients.length}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-touch admin-clients-results-bar__clear"
                onClick={clearBrowseFilter}
              >
                Сбросить
              </button>
            </div>
          ) : null}

          {!workspaceReady ? (
            <div className="td-list-loading" role="status" aria-live="polite" aria-busy="true">
              <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
              <p className="muted td-list-loading__text">Загрузка клиентов…</p>
            </div>
          ) : sortedFilteredClients.length > 0 ? (
            <>
              <ul className="list os-enter">
                {visibleClients.map((c) => (
                  <TrainerClientListItem
                    key={c.id}
                    rowId={`trainer-client-${c.id}`}
                    client={c}
                    today={today}
                    memList={memByClient[c.id] ?? []}
                    clientTrainings={trainingsByClientId[c.id] ?? []}
                    lastTrainingIso={lastCompletedByClientId[c.id] ?? lastTrainingDateByClientId[c.id] ?? '—'}
                    showBirthdayLabel={quickFilter === 'birthdays'}
                    outreachScenario={isOutreachScenario(quickFilter) ? quickFilter : null}
                    outreachHint={
                      isOutreachScenario(quickFilter)
                        ? buildOutreachScenarioHint(quickFilter, memByClient[c.id] ?? [], today)
                        : null
                    }
                    highlighted={highlightClientId === String(c.id)}
                    onWriteToMax={
                      isOutreachScenario(quickFilter)
                        ? async () => {
                            const result = await outreach.handleWriteToMax({
                              client: c,
                              scenario: quickFilter,
                              memList: memByClient[c.id] ?? [],
                              today,
                            })
                            if (result?.ok) {
                              setSentTodayIds((prev) => new Set([...prev, String(c.id)]))
                            }
                          }
                        : null
                    }
                    outreachCopied={outreach.copiedClientId === c.id}
                    outreachBusy={outreach.busyClientId === c.id}
                    outreachSent={sentTodayIds.has(String(c.id))}
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
                  <button
                    type="button"
                    className="btn btn-ghost btn-touch"
                    onClick={() => setVisibleCount((n) => n + CLIENT_LIST_PAGE_SIZE)}
                  >
                    Показать ещё {Math.min(CLIENT_LIST_PAGE_SIZE, sortedFilteredClients.length - visibleCount)}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="trainer-path-empty" role="status">
              <UserRound size={28} aria-hidden className="os-empty-card__icon" />
              <p className="trainer-path-empty__text">
                {quickFilter !== 'all' || query.trim()
                  ? emptyFilterMessage()
                  : clients.length === 0
                    ? 'Пока нет клиентов. Нажмите «+», чтобы добавить.'
                    : 'Ничего не найдено.'}
              </p>
            </div>
          )}
        </div>
      </section>

      <ClientHardDeleteConfirmModal
        open={Boolean(confirmDelete)}
        clientName={confirmDelete?.name}
        busy={busy}
        aria-labelledby="delete-client-title"
        onCancel={() => !busy && setConfirmDelete(null)}
        onConfirm={() => void runDeleteClient()}
      />

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
              <div className="field">
                <label className="label">Номер карты</label>
                <input className="input" value={newClientForm.card_number} onChange={(e) => setNewClientForm((f) => ({ ...f, card_number: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Имя для сообщений в Max</label>
                <input
                  className="input"
                  value={newClientForm.outreach_name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, outreach_name: e.target.value }))}
                  onBlur={() =>
                    setNewClientForm((f) => ({ ...f, outreach_name: normalizeOutreachName(f.outreach_name) }))
                  }
                  placeholder="Необязательно, если во ФИО есть полное имя"
                />
              </div>
              <div className="field">
                <label className="label">Ссылка на чат в Max</label>
                <input
                  className="input"
                  value={newClientForm.max_chat_url}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, max_chat_url: e.target.value }))}
                  onBlur={() =>
                    setNewClientForm((f) => ({ ...f, max_chat_url: normalizeMaxChatUrl(f.max_chat_url) }))
                  }
                  placeholder="max.ru/u/… — чат откроется сразу"
                  title="Max → профиль → Поделиться"
                  inputMode="url"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label className="label">
                  <input
                    type="checkbox"
                    checked={Boolean(newClientForm.as_pnk)}
                    onChange={(e) => setNewClientForm((f) => ({ ...f, as_pnk: e.target.checked }))}
                  />{' '}
                  Это ПНК (пробная / воронка)
                </label>
              </div>
              {newClientForm.as_pnk ? (
                <div className="field">
                  <span className="label">Бесплатных тренировок</span>
                  <select
                    className="input"
                    value={Number(newClientForm.pnk_trial_sessions) === 2 ? 2 : 1}
                    onChange={(e) =>
                      setNewClientForm((f) => ({
                        ...f,
                        pnk_trial_sessions: Number(e.target.value) === 2 ? 2 : 1,
                      }))
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>
              ) : null}
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
