import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Cake, Clock, Search, UserPlus } from 'lucide-react'
import { TrainerClientListItem } from '../../components/trainer/TrainerClientListItem'
import { useAuth } from '../../context/AuthContext'
import { deleteClientAndAllData, listClubsLocal } from '../../lib/dataAccess'
import {
  BIRTHDAY_WINDOW_DAYS,
  compareByUpcomingBirthday,
  isBirthdayWithinNextDays,
} from '../../lib/clientBirthdays'
import { membershipSignal } from '../../lib/clientListSignals'
import { CLIENT_LIST_PAGE_SIZE } from '../../lib/clientListPagination'
import { todayLocalIso } from '../../lib/dateRu'
import { loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import { pullTrainerWorkspaceFromCloud } from '../../lib/trainerPullService'
import { isAppOnline } from '../../lib/syncService'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { flushSyncQueue, saveLocalWithSync } from '../../lib/syncService'
import { isSupabaseConfigured } from '../../lib/supabase'

export function TrainerClients() {
  const { user, refreshUserProfile } = useAuth()
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
  const [quickFilter, setQuickFilter] = useState('all') // all | expiring | expired_remaining | birthdays
  const [clientsTab, setClientsTab] = useState('active') // active | archive
  const [visibleCount, setVisibleCount] = useState(CLIENT_LIST_PAGE_SIZE)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', birth_date: '', card_number: '' })
  const [clubs, setClubs] = useState([])
  /** false до первой загрузки снимка — не показываем «клуб не назначен» и пустой список */
  const [workspaceReady, setWorkspaceReady] = useState(false)
  /** { id, name } — модалка подтверждения удаления клиента */
  const [confirmDelete, setConfirmDelete] = useState(null)

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

  // Архивные клиенты с сервера подгружаем только при открытии вкладки «Архив».
  useEffect(() => {
    if (clientsTab !== 'archive') return
    if (!user?.id) return
    if (!isSupabaseConfigured() || !isAppOnline()) return
    // Если в локальном кэше архива нет — подтянем один раз.
    if (archivedClients.length > 0) return
    void (async () => {
      await pullTrainerWorkspaceFromCloud(user.id, { mode: 'archive' })
      await reload({ silent: true })
    })()
  }, [clientsTab, archivedClients.length, user?.id, reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  const today = todayLocalIso()

  const myClubName = useMemo(() => {
    if (!trainerClubId) return null
    return clubs.find((x) => x.id === trainerClubId)?.name ?? null
  }, [clubs, trainerClubId])

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

    let list = base
    if (quickFilter === 'birthdays') {
      list = base.filter((c) => isBirthdayWithinNextDays(c.birth_date, today, BIRTHDAY_WINDOW_DAYS))
      return [...list].sort((a, b) => compareByUpcomingBirthday(a, b, today))
    }
    if (quickFilter === 'all') return list
    return list.filter((c) => {
      const sig = membershipSignal(memByClient[c.id] ?? [], today)
      return sig.key === quickFilter
    })
  }, [clients, archivedClients, clientsTab, query, quickFilter, memByClient, today])

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
    let expired_remaining = 0
    let birthdays = 0
    for (const c of base) {
      const sig = membershipSignal(memByClient[c.id] ?? [], today)
      if (sig.key === 'expiring') expiring++
      if (sig.key === 'expired_remaining') expired_remaining++
      if (isBirthdayWithinNextDays(c.birth_date, today, BIRTHDAY_WINDOW_DAYS)) birthdays++
    }
    return { all, expiring, expired_remaining, birthdays }
  }, [clients, archivedClients, clientsTab, memByClient, today])

  const filterBtnClass = (id) => `btn ${quickFilter === id ? 'btn-primary' : 'btn-ghost'} btn-icon-square`

  const applyFilter = (id) => {
    setQuickFilter((cur) => (cur === id ? 'all' : id))
  }

  const updateClientArchiveFlag = async (clientRow, archived) => {
    if (!clientRow?.id) return
    if (archived) {
      const ok = window.confirm(`Убрать клиента в архив?\n\n${clientRow.name ?? 'Клиент'}\n\nВ архиве доступен просмотр карточки. Все действия — только после «Вернуть».`)
      if (!ok) return
    }
    setBusy(true)
    const now = new Date().toISOString()
    const row = { ...clientRow, archived_at: archived ? now : null }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: clientRow.id })
      if (isSupabaseConfigured()) {
        await flushSyncQueue({ force: true, maxMs: 20_000 })
      }
      await reload({ silent: true })
    } catch (err) {
      alert(err?.message ?? 'Не удалось обновить архив')
    } finally {
      setBusy(false)
    }
  }

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
      card_number: String(newClientForm.card_number ?? '').trim() || null,
      created_at: now,
    }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'insert', remote_id: null })
      if (isSupabaseConfigured()) {
        await flushSyncQueue({ force: true, maxMs: 20_000 })
      }
    } catch (err) {
      alert(err?.message ?? 'Ошибка создания клиента')
      return
    }
    setShowNewClient(false)
    setNewClientForm({ name: '', phone: '', birth_date: '', card_number: '' })
    await reload()
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

  return (
    <div className="grid stagger td-grid">
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
                aria-label="Фильтр: абонемент заканчивается в ближайшие 3 дня"
                title={`≤ 3 дня (${filterCounts.expiring})`}
              >
                <Clock size={20} aria-hidden />
              </button>
              <button
                type="button"
                className={filterBtnClass('expired_remaining')}
                onClick={() => applyFilter('expired_remaining')}
                aria-label="Фильтр: срок абонемента истёк, но тренировки остались"
                title={`Срок истёк, осталось (${filterCounts.expired_remaining})`}
              >
                <AlertTriangle size={20} aria-hidden />
              </button>
              <button
                type="button"
                className={filterBtnClass('birthdays')}
                onClick={() => applyFilter('birthdays')}
                aria-label={`Фильтр: дни рождения в ближайшие ${BIRTHDAY_WINDOW_DAYS} дней`}
                title={`ДР ${BIRTHDAY_WINDOW_DAYS} дн. (${filterCounts.birthdays})`}
              >
                <Cake size={20} aria-hidden />
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
        <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="tab"
            aria-selected={clientsTab === 'active'}
            onClick={() => setClientsTab('active')}
          >
            Активные ({clients.length})
          </button>
          <button
            type="button"
            className="tab"
            aria-selected={clientsTab === 'archive'}
            onClick={() => setClientsTab('archive')}
          >
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
                  Клуб не назначен. Клиенты скрыты, создание тренировки/клиентов недоступно — попросите админа
                  назначить клуб.
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
                      lastTrainingIso={lastTrainingDateByClientId[c.id] ?? '—'}
                      showBirthdayLabel={quickFilter === 'birthdays'}
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
                      Показать ещё {Math.min(CLIENT_LIST_PAGE_SIZE, filteredClients.length - visibleCount)}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">
                {quickFilter === 'birthdays'
                  ? `В ближайшие ${BIRTHDAY_WINDOW_DAYS} дней дней рождения нет (укажите дату в карточке клиента).`
                  : clients.length === 0 && !query.trim() && quickFilter === 'all'
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
