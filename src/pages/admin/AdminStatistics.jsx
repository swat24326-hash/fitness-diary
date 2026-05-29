import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Eye, RefreshCw, UserCircle, X } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  loadAdminJournalPage,
  loadAdminHealthCardsByClientIds,
  listTrainerSummariesForAdmin,
} from '../../lib/dataAccess'
import { useDebouncedStorageReload, shouldReloadAdminStatsPage } from '../../lib/useDebouncedStorageReload'
import {
  ADMIN_JOURNAL_DEFAULT_PAGE_SIZE,
  ADMIN_JOURNAL_PAGE_SIZE_OPTIONS,
} from '../../lib/admin/adminConstants'
import { formatDateRu } from '../../lib/dateRu'
import { fetchMembershipsForClubViaAdminApi } from '../../lib/admin/adminApiClient'
import { membershipCardTypeLabelForTraining } from '../../lib/admin/membershipTypeStatsAgg'
import { getDb } from '../../lib/localDb'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { AdminInactiveClientsPanel } from '../../components/AdminInactiveClientsPanel'
import { TrainingExercisesReadonly } from '../../components/TrainingExercisesReadonly'
import { AdminClubStatsSection } from './AdminClubStatsSection'

function bmiFromHealthRow(health) {
  const hCm = Number(String(health?.height_cm ?? '').replace(',', '.'))
  const wKg = Number(String(health?.weight_kg ?? '').replace(',', '.'))
  if (!Number.isFinite(hCm) || !Number.isFinite(wKg) || hCm <= 0 || wKg <= 0) return null
  const m = hCm / 100
  const v = wKg / (m * m)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

function AdminHealthReadonly({ health }) {
  const bmi = useMemo(() => bmiFromHealthRow(health), [health])
  if (!health) {
    return <p className="muted" style={{ margin: 0 }}>Медкарта не заведена или пуста.</p>
  }
  const diseases = health.diseases ?? ''
  const contraindications = health.contraindications ?? ''
  const medications = health.medications ?? ''
  const notes = health.notes ?? ''
  const hasText = diseases || contraindications || medications || notes
  const hasMetrics =
    health.height_cm != null && health.height_cm !== '' && health.weight_kg != null && health.weight_kg !== ''

  if (!hasText && !hasMetrics && bmi == null) {
    return <p className="muted" style={{ margin: 0 }}>В медкарте пока нет данных.</p>
  }

  return (
    <div className="grid health-mini" style={{ gap: 8 }}>
      {(health.height_cm != null && health.height_cm !== '') ||
      (health.weight_kg != null && health.weight_kg !== '') ||
      bmi != null ? (
        <div className="health-mini__top">
          <div className="health-mini__metric">
            <span className="muted">Рост</span>
            <strong>{health.height_cm != null && health.height_cm !== '' ? `${health.height_cm} см` : '—'}</strong>
          </div>
          <div className="health-mini__metric">
            <span className="muted">Вес</span>
            <strong>{health.weight_kg != null && health.weight_kg !== '' ? `${health.weight_kg} кг` : '—'}</strong>
          </div>
          <div className="health-mini__metric">
            <span className="muted">ИМТ</span>
            <strong>{bmi != null ? bmi : '—'}</strong>
          </div>
        </div>
      ) : null}
      <p style={{ margin: 0 }}>
        <span className="muted">Заболевания:</span> {diseases || '—'}
      </p>
      <p style={{ margin: 0 }}>
        <span className="muted">Противопоказания:</span> {contraindications || '—'}
      </p>
      <p style={{ margin: 0 }}>
        <span className="muted">Препараты:</span> {medications || '—'}
      </p>
      <p style={{ margin: 0 }}>
        <span className="muted">Заметки:</span> {notes || '—'}
      </p>
      {health.updated_at ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Обновлено: {String(health.updated_at).slice(0, 10)}
        </p>
      ) : null}
    </div>
  )
}

export function AdminStatistics() {
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [search] = useSearchParams()
  const club = search.get('club') ?? clubIdCtx ?? ''

  const [statsRange, setStatsRange] = useState({ start: '', end: '' })
  const [journalOpen, setJournalOpen] = useState(false)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [inactiveClients, setInactiveClients] = useState([])
  const onStatsRange = useCallback((r) => {
    setPage(0)
    setJournalOpen(false)
    setInactiveOpen(false)
    if (!r?.start || !r?.end) {
      setStatsRange({ start: '', end: '' })
      return
    }
    setStatsRange({ start: r.start, end: r.end })
  }, [])

  const [rows, setRows] = useState([])
  const [clients, setClients] = useState({})
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(ADMIN_JOURNAL_DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [previewTraining, setPreviewTraining] = useState(null)
  const [healthByClientId, setHealthByClientId] = useState({})
  const [healthCardsFallback, setHealthCardsFallback] = useState(null)
  const [busy, setBusy] = useState(false)
  const loadSeqRef = useRef(0)
  const [trainerNameById, setTrainerNameById] = useState({})
  const [journalSource, setJournalSource] = useState('local')
  const [journalFallback, setJournalFallback] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [membershipTypes, setMembershipTypes] = useState([])

  const membershipById = useMemo(() => {
    const m = new Map()
    for (const row of memberships) {
      const id = String(row?.id ?? '').trim()
      if (id) m.set(id, row)
    }
    return m
  }, [memberships])

  const typeCodeById = useMemo(() => {
    const m = new Map()
    for (const t of membershipTypes) {
      const id = String(t?.id ?? '').trim()
      if (!id) continue
      m.set(id, String(t.code ?? t.name ?? '').trim() || '—')
    }
    return m
  }, [membershipTypes])

  const loadMembershipContext = useCallback(async () => {
    if (!club) {
      setMemberships([])
      setMembershipTypes([])
      return
    }
    try {
      const types = await listMembershipTypesForClub(club)
      setMembershipTypes(types)
    } catch {
      setMembershipTypes([])
    }
    try {
      const via = await fetchMembershipsForClubViaAdminApi(club)
      if (via?.memberships?.length) {
        setMemberships(via.memberships)
        return
      }
    } catch {
      /* локальный кэш */
    }
    try {
      const db = await getDb()
      const all = await db.getAll('memberships')
      setMemberships(all.filter((m) => m.club_id === club))
    } catch {
      setMemberships([])
    }
  }, [club])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!journalOpen || !club || !statsRange.start || !statsRange.end) {
      setRows([])
      setClients({})
      setTotalCount(0)
      setTrainerNameById({})
      setHealthByClientId({})
      setHealthCardsFallback(null)
      setJournalSource('local')
      setJournalFallback(null)
      return
    }
    if (!silent) setBusy(true)
    const seq = ++loadSeqRef.current
    try {
      const j = await loadAdminJournalPage({
        page,
        pageSize,
        filters: {
          clubId: club,
          trainerId: '',
          clientId: '',
          status: 'completed',
          dateFrom: statsRange.start,
          dateTo: statsRange.end,
        },
      })
      if (seq !== loadSeqRef.current) return
      setClients(j.clientsById)
      setRows(j.trainings)
      setTotalCount(typeof j.totalCount === 'number' ? j.totalCount : j.trainings.length)
      setJournalSource(j.source)
      setJournalFallback(j.fallbackReason ?? null)

      const fromApi = await listTrainerSummariesForAdmin()
      if (seq !== loadSeqRef.current) return
      const nameById = {}
      for (const u of fromApi) {
        nameById[u.id] = u.name?.trim() || '—'
      }
      const pageRows = j.trainings
      for (const t of pageRows) {
        const id = t.trainer_id
        if (id && !nameById[id]) {
          nameById[id] = `Тренер ${String(id).slice(0, 8)}…`
        }
      }
      setTrainerNameById(nameById)

      const clientIdsOnPage = [...new Set(pageRows.map((t) => t.client_id).filter(Boolean))]
      const hc = await loadAdminHealthCardsByClientIds(clientIdsOnPage)
      if (seq !== loadSeqRef.current) return
      setHealthByClientId(hc.healthByClientId ?? {})
      setHealthCardsFallback(hc.fallbackReason ?? null)
    } catch {
      if (seq !== loadSeqRef.current) return
      setRows([])
      setClients({})
      setTotalCount(0)
      setTrainerNameById({})
      setJournalSource('local')
      setJournalFallback(null)
      setHealthByClientId({})
      setHealthCardsFallback(null)
    } finally {
      if (seq === loadSeqRef.current && !silent) setBusy(false)
    }
  }, [page, pageSize, club, statsRange.start, statsRange.end, journalOpen])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!journalOpen) return
    void loadMembershipContext()
    requestAnimationFrame(() => {
      document.getElementById('admin-completed-trainings-journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [journalOpen, loadMembershipContext])

  useEffect(() => {
    setPage(0)
    setJournalOpen(false)
    setInactiveOpen(false)
  }, [club])

  const openCompletedJournal = useCallback(() => {
    setInactiveOpen(false)
    setJournalOpen(true)
    setPage(0)
  }, [])

  const openInactive = useCallback((clients) => {
    setJournalOpen(false)
    setInactiveClients(Array.isArray(clients) ? clients : [])
    setInactiveOpen(true)
  }, [])

  useEffect(() => {
    if (!inactiveOpen) return
    requestAnimationFrame(() => {
      document.getElementById('admin-inactive-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [inactiveOpen])

  useDebouncedStorageReload(() => void load({ silent: true }), { shouldRun: shouldReloadAdminStatsPage })

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [totalCount, pageSize, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const rangeFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const rangeTo = totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount)
  const canPrev = page > 0
  const canNext = (page + 1) * pageSize < totalCount

  const trainerCell = (tid) => {
    if (!tid) return '—'
    return trainerNameById[tid] ?? (String(tid).length > 10 ? `${String(tid).slice(0, 8)}…` : tid)
  }

  return (
    <div className="grid stagger td-grid">
      <div className="row td-top">
        <div className="u-grow u-minw-0 td-top__grow">
          <h1 className="section-title td-top__title">Статистика клуба</h1>
          <p className="section-sub td-top__sub muted" style={{ fontSize: 14, margin: '6px 0 0', lineHeight: 1.45 }}>
            Показатели по залу за период. Списки <strong>«Не активные»</strong> и <strong>«Проведено тренировок»</strong> — по нажатию на карточки в сводке; график по дням и таблица типов — там же.
          </p>
        </div>
      </div>

      <AdminClubStatsSection
        clubId={club}
        onActiveRangeChange={onStatsRange}
        onOpenCompletedJournal={openCompletedJournal}
        onOpenInactive={openInactive}
      />

      {inactiveOpen ? (
        <section className="card" id="admin-inactive-panel">
          <div className="td-section-head">
            <h2 className="section-title td-section-title" style={{ margin: 0 }}>
              Не активные — {inactiveClients.length}
            </h2>
            <button type="button" className="btn btn-ghost btn-touch" onClick={() => setInactiveOpen(false)}>
              Скрыть
            </button>
          </div>
          {club && statsRange.start && statsRange.end ? (
            <AdminInactiveClientsPanel clients={inactiveClients} dateFrom={statsRange.start} dateTo={statsRange.end} clubId={club} />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Выберите клуб и период в сводке выше.
            </p>
          )}
        </section>
      ) : null}

      {journalOpen ? (
      <section className="card" id="admin-completed-trainings-journal">
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Проведённые тренировки
          </h2>
          <div className="row td-actions">
            <button
              type="button"
              className="btn btn-ghost btn-touch"
              onClick={() => setJournalOpen(false)}
            >
              Скрыть
            </button>
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch"
              disabled={busy}
              onClick={() => void load()}
              aria-label="Обновить список"
              title="Обновить"
            >
              <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {!club ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Выберите клуб в панели выше — список завершённых тренировок строится в разрезе зала.
          </p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Завершённые тренировки за период из блока «Период» выше ({statsRange.start && statsRange.end ? `${formatDateRu(statsRange.start)} — ${formatDateRu(statsRange.end)}` : '…'}).{' '}
              {journalSource === 'remote' ? (
                <>Данные из <strong>Supabase</strong>.</>
              ) : (
                <>
                  С <strong>устройства</strong> (IndexedDB).
                  {!isSupabaseConfigured()
                    ? ' Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (.env локально или Vercel → Environment Variables, затем Redeploy).'
                    : null}
                </>
              )}
            </p>
            {journalFallback ? <p className="muted admin-inline-note">Резерв: локальный кэш. Причина: {journalFallback}</p> : null}
            {healthCardsFallback ? (
              <p className="muted admin-inline-note">Медкарты: локальный кэш. Причина: {healthCardsFallback}</p>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>№ карты</th>
                    <th>Тренер</th>
                    <th>Дата</th>
                    <th>Тип карты</th>
                    <th title="Просмотр" />
                    <th title="Карточка клиента" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>{clients[t.client_id]?.name ?? t.client_id}</td>
                      <td className="muted">{String(clients[t.client_id]?.card_number ?? '').trim() || '—'}</td>
                      <td className="muted" title={t.trainer_id}>
                        {trainerCell(t.trainer_id)}
                      </td>
                      <td>{formatDateRu(t.date)}</td>
                      <td>{membershipCardTypeLabelForTraining(t, membershipById, typeCodeById)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch"
                          onClick={() => setPreviewTraining(t)}
                          aria-label="Просмотр тренировки"
                          title="Просмотр"
                        >
                          <Eye size={16} aria-hidden />
                        </button>
                      </td>
                      <td>
                        <Link
                          to={`/admin/clients/${t.client_id}${club ? `?club=${encodeURIComponent(club)}` : ''}`}
                          className="btn btn-ghost btn-icon-square btn-touch u-no-decoration"
                          aria-label="Карточка клиента"
                          title="Карточка клиента"
                        >
                          <UserCircle size={16} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className="row"
              style={{
                flexWrap: 'wrap',
                gap: 12,
                marginTop: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {totalCount === 0
                  ? 'Нет завершённых тренировок в этом периоде.'
                  : `Записи ${rangeFrom}–${rangeTo} из ${totalCount} · стр. ${page + 1} из ${totalPages}`}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  На странице
                  <select
                    className="select"
                    style={{ minWidth: 72 }}
                    value={String(pageSize)}
                    disabled={busy}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(0)
                    }}
                  >
                    {ADMIN_JOURNAL_PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row journal-pagination" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-touch"
                    disabled={!canPrev}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Предыдущая страница"
                  >
                    <ChevronLeft size={18} aria-hidden />
                    Назад
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-touch"
                    disabled={!canNext}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Следующая страница"
                  >
                    Вперёд
                    <ChevronRight size={18} aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
      ) : null}

      {previewTraining && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-stat-view-title"
          onClick={() => setPreviewTraining(null)}
        >
          <div className="modal-panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <h2 id="admin-stat-view-title" className="section-title td-section-title" style={{ margin: 0, flex: '1 1 auto' }}>
                Тренировка {formatDateRu(previewTraining.date)}
              </h2>
              <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={() => setPreviewTraining(null)} aria-label="Закрыть">
                <X size={20} aria-hidden />
              </button>
            </div>

            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              Клиент: <strong>{clients[previewTraining.client_id]?.name ?? previewTraining.client_id}</strong>
              {clients[previewTraining.client_id]?.phone ? ` · ${clients[previewTraining.client_id].phone}` : ''}{' '}
              <Link
                to={`/admin/clients/${previewTraining.client_id}${club ? `?club=${encodeURIComponent(club)}` : ''}`}
                className="u-no-decoration"
                style={{ color: 'var(--accent-bright)' }}
                onClick={() => setPreviewTraining(null)}
              >
                Полная карточка
              </Link>
            </p>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              Карта здоровья
            </h3>
            <div style={{ marginBottom: 16 }}>
              <AdminHealthReadonly health={healthByClientId[previewTraining.client_id]} />
            </div>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              Данные тренировки
            </h3>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
              Тип: <strong>{previewTraining.type ?? '—'}</strong>
            </p>
            {previewTraining.data?.exercises?.length ? (
              <div style={{ marginBottom: 12 }}>
                <TrainingExercisesReadonly
                  exercises={previewTraining.data.exercises}
                  sessionType={previewTraining.type}
                />
              </div>
            ) : null}
            <details style={{ marginTop: 8 }}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                JSON (отладка)
              </summary>
              <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 240, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {JSON.stringify(previewTraining.data, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}
