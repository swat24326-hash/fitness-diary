import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Clock, RefreshCw, Search, Trash2, UserCog, UserSearch } from 'lucide-react'
import {
  deleteClientAndAllData,
  dispatchLocalDataChanged,
  getLocalClient,
  listAdminClientsForClub,
  listTrainerSummariesForAdmin,
} from '../../lib/dataAccess'
import { loadAdminClubWorkspaceExtras } from '../../lib/admin/adminClubWorkspaceCache'
import { pullAdminClientsFromCloud } from '../../lib/admin/adminClientsListService'
import { useDebouncedStorageReload, shouldReloadAdminClientsPage } from '../../lib/useDebouncedStorageReload'
import { ADMIN_CLIENTS_REMOTE_LIMIT } from '../../lib/admin/adminConstants'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { USERS_TRAINER_ROLES } from '../../lib/userRoleConstants'
import { saveLocalWithSync } from '../../lib/syncService'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { countedUsedTrainingsOnMembership, membershipHasRemaining, membershipUsageLabel, pickUsableMembershipForDate } from '../../lib/membershipRules'

function pickExpiredMembershipWithRemaining(list, todayIso) {
  const d = String(todayIso ?? '')
  const candidates = (list ?? []).filter((m) => String(m?.end_date ?? '') < d && membershipHasRemaining(m))
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

function membershipSignal(list, today) {
  const active = pickUsableMembershipForDate(list ?? [], today)
  if (!active) {
    const expiredLeft = pickExpiredMembershipWithRemaining(list, today)
    if (expiredLeft) {
      const total = Number(expiredLeft.total_trainings ?? 0)
      const used = Number(expiredLeft.used_trainings ?? 0)
      const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
      return { key: 'expired_remaining', color: '#f59e0b', label: `срок истёк, осталось ${remaining ?? '—'}` }
    }
    return { key: 'none', color: '#f87171', label: 'нет активного' }
  }

  const total = Number(active.total_trainings ?? 0)
  const used = Number(active.used_trainings ?? 0)
  const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
  if (remaining === 0) return { key: 'limit0', color: '#f87171', label: 'лимит 0' }

  const end = new Date(active.end_date)
  const d0 = new Date(today)
  const days = Math.ceil((end - d0) / 86400000)
  if (days <= 3) return { key: 'expiring', color: '#eab308', label: `≤${days}д` }
  return { key: 'active', color: '#22c55e', label: 'активен' }
}

function lastTrainingDate(trainings, clientId) {
  const ts = trainings.filter((t) => t.client_id === clientId).map((t) => t.date || t.created_at?.slice(0, 10))
  if (!ts.length) return '—'
  return formatDateRu(ts.sort((a, b) => String(b).localeCompare(String(a)))[0])
}

export function AdminClients() {
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [search] = useSearchParams()
  const club = search.get('club') ?? clubIdCtx ?? ''

  const [clients, setClients] = useState([])
  const [trainings, setTrainings] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [trainerNameById, setTrainerNameById] = useState({})
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [trainerQuery, setTrainerQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [source, setSource] = useState('local')
  const [fallback, setFallback] = useState(null)
  const [cloudNeedsClub, setCloudNeedsClub] = useState(false)
  const [listTruncated, setListTruncated] = useState(false)

  const [reassignClient, setReassignClient] = useState(null)
  const [trainerOptions, setTrainerOptions] = useState([])
  const [reassignTrainerId, setReassignTrainerId] = useState('')
  const [reassignManualUuid, setReassignManualUuid] = useState('')
  const [reassignLoadErr, setReassignLoadErr] = useState('')
  const [reassignBusy, setReassignBusy] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBusy(true)
    try {
      const [{ clients: list, source: src, fallbackReason, cloudNeedsClub: need, truncated: trunc }, trainers] = await Promise.all([
        listAdminClientsForClub({ clubId: club || '' }),
        listTrainerSummariesForAdmin(),
      ])
      setListTruncated(!!trunc)
      setCloudNeedsClub(!!need)
      setSource(src)
      setFallback(fallbackReason ?? null)

      const nm = {}
      for (const u of trainers) {
        nm[u.id] = u.name?.trim() || '—'
      }
      setTrainerNameById(nm)

      const arr = Array.isArray(list) ? list : []
      setClients(arr)

      const { memByClient: map, trainings: tFiltered } = await loadAdminClubWorkspaceExtras(
        club || '',
        arr.map((c) => c.id),
      )
      setMemByClient(map)
      setTrainings(tFiltered)
    } catch {
      setClients([])
      setTrainings([])
      setMemByClient({})
      setTrainerNameById({})
      setSource('local')
      setFallback(null)
      setCloudNeedsClub(false)
      setListTruncated(false)
    } finally {
      if (!silent) setBusy(false)
    }
  }, [club])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadAdminClientsPage })

  const refreshFromCloud = useCallback(async () => {
    if (!club?.trim()) {
      setRefreshMsg('Выберите клуб в панели сверху.')
      return
    }
    setBusy(true)
    setRefreshMsg('')
    try {
      if (isSupabaseConfigured() && navigator.onLine) {
        const r = await pullAdminClientsFromCloud(club)
        if (r.ok) {
          const extra =
            (r.pruned_clients ?? 0) > 0 || (r.pruned_trainings ?? 0) > 0
              ? ` Очищено из кэша: клиентов ${r.pruned_clients ?? 0}, черновиков ${r.pruned_trainings ?? 0}.`
              : ''
          setRefreshMsg(`Список обновлён из облака (${r.count ?? 0} клиентов).${extra}`)
        } else if (r.reason === 'no_club') {
          setRefreshMsg('Выберите клуб.')
        } else {
          setRefreshMsg('Не удалось загрузить с сервера — показан локальный кэш.')
        }
      }
      await reload({ silent: true })
    } catch (e) {
      setRefreshMsg(e?.message ?? 'Ошибка обновления')
      await reload({ silent: true })
    } finally {
      setBusy(false)
    }
  }, [club, reload])

  const today = todayLocalIso()

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tq = trainerQuery.trim().toLowerCase()

    let base = clients
    if (q) {
      base = base.filter((c) => {
        const name = String(c.name ?? '').toLowerCase()
        const phone = String(c.phone ?? '').toLowerCase()
        const card = String(c.card_number ?? '').toLowerCase()
        return name.includes(q) || phone.includes(q) || card.includes(q)
      })
    }
    if (tq) {
      base = base.filter((c) => {
        const trainerName = String(trainerNameById[c.trainer_id] ?? '').toLowerCase()
        return trainerName && trainerName.includes(tq)
      })
    }

    if (quickFilter === 'all') return base
    return base.filter((c) => {
      const sig = membershipSignal(memByClient[c.id] ?? [], today)
      return sig.key === quickFilter
    })
  }, [clients, query, trainerQuery, quickFilter, memByClient, today, trainerNameById])

  const filterCounts = useMemo(() => {
    let expiring = 0
    let expired_remaining = 0
    for (const c of clients) {
      const sig = membershipSignal(memByClient[c.id] ?? [], today)
      if (sig.key === 'expiring') expiring++
      if (sig.key === 'expired_remaining') expired_remaining++
    }
    return { all: clients.length, expiring, expired_remaining }
  }, [clients, memByClient, today])

  const filterBtnClass = (id) => `btn ${quickFilter === id ? 'btn-primary' : 'btn-ghost'} btn-icon-square`

  const applyFilter = (id) => {
    setQuickFilter((cur) => (cur === id ? 'all' : id))
  }

  const trainerLabel = (tid) => {
    if (!tid) return '—'
    return trainerNameById[tid] ?? (String(tid).length > 10 ? `Тренер ${String(tid).slice(0, 8)}…` : tid)
  }

  const clubQs = club ? `?club=${encodeURIComponent(club)}` : ''

  const closeReassignModal = () => {
    if (reassignBusy) return
    setReassignClient(null)
    setReassignLoadErr('')
    setReassignManualUuid('')
    setTrainerOptions([])
  }

  const openReassignModal = useCallback(async (c) => {
    if (!c?.id) return
    setReassignLoadErr('')
    setReassignManualUuid('')
    setReassignTrainerId(String(c.trainer_id ?? ''))
    setTrainerOptions([])
    setReassignClient({ id: c.id, name: c.name ?? 'Клиент', trainer_id: c.trainer_id })
    try {
      const list = await listTrainerSummariesForAdmin()
      const arr = Array.isArray(list) ? list : []
      setTrainerOptions(arr)
      if (!arr.length && isSupabaseConfigured()) {
        setReassignLoadErr('Список тренеров пуст или нет доступа (RLS). Можно ввести UUID вручную ниже.')
      }
      if (!arr.length && !isSupabaseConfigured()) {
        setReassignLoadErr('Облако не подключено — укажите UUID нового тренера вручную.')
      }
    } catch {
      setReassignLoadErr('Не удалось загрузить список тренеров. Укажите UUID вручную.')
    }
  }, [])

  const applyReassignTrainer = async () => {
    if (!reassignClient?.id) return
    const fromList = reassignTrainerId.trim()
    const fromManual = reassignManualUuid.trim()
    const tid = trainerOptions.length > 0 ? fromList : fromManual
    if (!tid) {
      alert('Выберите тренера или введите UUID.')
      return
    }
    if (tid === reassignClient.trainer_id) {
      closeReassignModal()
      return
    }
    const full = await getLocalClient(reassignClient.id)
    if (!full) {
      alert('Клиент не найден в локальном кэше. Обновите список.')
      return
    }
    setReassignBusy(true)
    try {
      let nextClubId = full.club_id ?? null
      const picked = trainerOptions.find((u) => u.id === tid)
      if (trainerOptions.length > 0 && picked) {
        nextClubId = picked.club_id ?? null
      } else if (isSupabaseConfigured()) {
        const { data: trRow } = await supabase
          .from('users')
          .select('club_id')
          .eq('id', tid)
          .in('role', USERS_TRAINER_ROLES)
          .maybeSingle()
        if (trRow) nextClubId = trRow.club_id ?? nextClubId
      }
      const row = { ...full, trainer_id: tid, club_id: nextClubId }
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: full.id })
      dispatchLocalDataChanged({ reason: 'client-trainer-reassigned', clientId: full.id })
      closeReassignModal()
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Ошибка сохранения')
    } finally {
      setReassignBusy(false)
    }
  }

  const runDeleteClient = async () => {
    if (!confirmDelete?.id) return
    setDeleteBusy(true)
    try {
      await deleteClientAndAllData(confirmDelete.id)
      setConfirmDelete(null)
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Не удалось удалить клиента')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="grid stagger td-grid">
      <div className="row td-top">
        <div className="u-grow u-minw-0 td-top__grow">
          <h1 className="section-title td-top__title">Клиенты</h1>
          <p className="section-sub td-top__sub muted" style={{ fontSize: 14, margin: '6px 0 0', lineHeight: 1.45 }}>
            Список как у тренера: абонемент и последняя тренировка. У каждого клиента указан <strong>закреплённый тренер</strong> (владелец карточки).
          </p>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title td-section-title" style={{ margin: '0 0 12px' }}>
          Поиск
        </h2>
        <div className="admin-clients-search-row">
          <div className="admin-clients-search-pair" role="group" aria-label="Поиск клиента и тренера">
            <div className="admin-clients-search-cell">
              <Search size={18} aria-hidden className="muted u-shrink-0" />
              <input
                className="admin-clients-search-input"
                type="search"
                autoComplete="off"
                placeholder="Клиент: фамилия, телефон или номер карты…"
                aria-label="Поиск по клиенту"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="admin-clients-search-cell">
              <UserSearch size={18} aria-hidden className="muted u-shrink-0" />
              <input
                className="admin-clients-search-input"
                type="search"
                autoComplete="off"
                placeholder="Тренер: ФИО…"
                aria-label="Поиск по закреплённому тренеру"
                value={trainerQuery}
                onChange={(e) => setTrainerQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="admin-clients-search-filters">
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
              disabled={busy}
              onClick={() => void refreshFromCloud()}
              aria-label="Обновить список из облака"
              title="Обновить из Supabase"
            >
              <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {refreshMsg && (
          <p className="sync-feedback sync-feedback--ok" style={{ margin: '0 0 12px' }}>
            {refreshMsg}
          </p>
        )}
        {cloudNeedsClub ? (
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
            В облачном режиме выберите <strong>клуб</strong> в панели выше — иначе список клиентов не загружается (избегаем выгрузки всей базы).
          </p>
        ) : (
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
            {source === 'remote' || source === 'admin_api' ? (
              <>Данные из <strong>Supabase</strong>{source === 'admin_api' ? ' (через сервер приложения)' : ''}.</>
            ) : (
              <>
                С <strong>устройства</strong> (IndexedDB).
                {!club ? ' Выберите клуб в шапке, чтобы отфильтровать список.' : null}
              </>
            )}
          </p>
        )}
        {fallback ? (
          <p className="admin-inline-note" style={{ color: 'var(--danger)', margin: '0 0 12px' }} role="alert">
            Не удалось загрузить с сервера: {fallback}
          </p>
        ) : null}
        {listTruncated ? (
          <p className="muted admin-inline-note" role="status">
            С сервера загружено не более <strong>{ADMIN_CLIENTS_REMOTE_LIMIT}</strong> клиентов по алфавиту — список мог быть обрезан, в клубе может быть больше людей.
          </p>
        ) : null}

        {!cloudNeedsClub && filteredClients.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {clients.length === 0 ? 'Нет клиентов по выбранным условиям.' : 'Никто не подходит под фильтр.'}
          </p>
        ) : null}

        {!cloudNeedsClub && filteredClients.length > 0 ? (
          <ul className="list">
            {filteredClients.map((c) => {
              const mlist = memByClient[c.id] ?? []
              const clientTrainings = trainings.filter((t) => t.client_id === c.id)
              const active = pickUsableMembershipForDate(mlist, today)
              const sig = membershipSignal(mlist, today)
              const expiredLeft = active ? null : pickExpiredMembershipWithRemaining(mlist, today)
              const last = lastTrainingDate(trainings, c.id)
              return (
                <li key={c.id} className="list-item td-client-item">
                  <div className="row td-client-row">
                    <div className="td-client-left">
                      <span title={sig.label} className="td-client-dot" style={{ background: sig.color }} />
                      <div>
                        <strong>{c.name}</strong>
                        <div className="muted td-muted-13">{c.phone ?? '—'}</div>
                        <div className="muted td-muted-13">Карта: {String(c.card_number ?? '').trim() || '—'}</div>
                        <div className="muted td-muted-13" style={{ marginTop: 4 }}>
                          <span style={{ fontWeight: 600 }}>Тренер: </span>
                          {trainerLabel(c.trainer_id)}
                        </div>
                      </div>
                    </div>
                    <div className="row td-client-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      <Link to={`/admin/clients/${c.id}${clubQs}`} className="btn btn-primary btn-touch u-no-decoration">
                        Карточка
                      </Link>
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch"
                          disabled={busy}
                          onClick={() => void openReassignModal(c)}
                          aria-label={`Переназначить тренера: ${c.name ?? c.id}`}
                          title="Переназначить тренера"
                        >
                          <UserCog size={20} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch td-client-delete"
                          disabled={busy}
                          aria-label={`Удалить клиента ${c.name ?? ''}`}
                          title="Удалить клиента"
                          onClick={() => setConfirmDelete({ id: c.id, name: c.name ?? 'Клиент' })}
                        >
                          <Trash2 size={20} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="muted td-muted-row">
                    {active ? (
                      <>
                        <span>
                          Абонемент до <strong>{formatDateRu(active.end_date)}</strong>
                        </span>
                        <span>
                          Использовано: <strong>{membershipUsageLabel(active, clientTrainings)}</strong>
                        </span>
                        <span className="td-muted-sep">·</span>
                      </>
                    ) : expiredLeft ? (
                      <>
                        <span>
                          Срок <strong>{formatDateRu(expiredLeft.end_date)}</strong>, осталось тренировок:{' '}
                          <strong>
                            {(() => {
                              const total = Number(expiredLeft.total_trainings ?? 0)
                              const used = Math.max(
                                0,
                                total - countedUsedTrainingsOnMembership(expiredLeft, clientTrainings),
                              )
                              const usedStored = Number(expiredLeft.used_trainings ?? 0)
                              const remaining = Number.isFinite(total)
                                ? Math.max(0, total - Math.max(used, usedStored))
                                : null
                              return remaining ?? '—'
                            })()}
                          </strong>
                        </span>
                        <span className="td-muted-sep">·</span>
                      </>
                    ) : (
                      <>
                        <span>Нет действующего абонемента</span>
                        <span className="td-muted-sep">·</span>
                      </>
                    )}
                    <span>
                      Последняя тренировка: <strong>{last}</strong>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      {reassignClient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-reassign-trainer-title" onClick={closeReassignModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="adm-reassign-trainer-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
              Переназначить тренера
            </h2>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Клиент <strong>{reassignClient.name}</strong> появится в списке выбранного тренера. Клуб клиента (зал в карточке) не меняется автоматически.
            </p>
            {reassignLoadErr ? <p className="muted admin-inline-note">{reassignLoadErr}</p> : null}
            {trainerOptions.length > 0 ? (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="adm-reassign-tr-select">
                  Тренер
                </label>
                <select
                  id="adm-reassign-tr-select"
                  className="select"
                  value={reassignTrainerId}
                  onChange={(e) => setReassignTrainerId(e.target.value)}
                  disabled={reassignBusy}
                >
                  {reassignClient.trainer_id && !trainerOptions.some((t) => t.id === reassignClient.trainer_id) ? (
                    <option value={reassignClient.trainer_id}>Текущий тренер (не в списке)</option>
                  ) : null}
                  {trainerOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="adm-reassign-tr-uuid">
                  UUID тренера (trainer_id)
                </label>
                <input
                  id="adm-reassign-tr-uuid"
                  className="input"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={reassignManualUuid}
                  onChange={(e) => setReassignManualUuid(e.target.value)}
                  disabled={reassignBusy}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="row td-modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-touch" onClick={closeReassignModal} disabled={reassignBusy}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary btn-touch" disabled={reassignBusy} onClick={() => void applyReassignTrainer()}>
                {reassignBusy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-delete-client-title" onClick={() => !deleteBusy && setConfirmDelete(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="adm-delete-client-title" className="section-title" style={{ marginTop: 0 }}>
              Удалить клиента?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Удаляем <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong> без возможности восстановления.
            </p>
            <p className="muted" style={{ marginTop: 10, fontSize: '0.9rem' }}>
              Удалятся все тренировки, абонементы, замеры тела и медкарта этого клиента.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={deleteBusy} onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-touch"
                style={{ background: 'rgba(248,113,113,0.2)', borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
                disabled={deleteBusy}
                onClick={() => void runDeleteClient()}
              >
                {deleteBusy ? 'Удаление…' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
