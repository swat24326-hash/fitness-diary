import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Eye, RefreshCw, UserCircle } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton'
import { useAuth } from '../../context/AuthContext'
import { loadAdminHealthCardsByClientIds } from '../../lib/dataAccess'
import { loadTrainerJournalFiltered } from '../../lib/trainer/trainerJournalService'
import {
  journalClientCardNumber,
  journalClientDisplayName,
} from '../../lib/trainer/trainerJournalClientsCore.js'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import {
  ADMIN_JOURNAL_DEFAULT_PAGE_SIZE,
  ADMIN_JOURNAL_PAGE_SIZE_OPTIONS,
} from '../../lib/admin/adminConstants'
import { formatDateRu } from '../../lib/dateRu'
import { membershipCardTypeLabelForTraining } from '../../lib/admin/membershipTypeStatsAgg'
import { loadClubMembershipsWithApiFallback } from '../../lib/membershipClubLoad'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { TrainingExercisesReadonly } from '../../components/TrainingExercisesReadonly'
import { AdminClubStatsSection } from '../admin/AdminClubStatsSection'
import { TrainerPayrollPanel } from '../../components/TrainerPayrollPanel'

import { getHealthCurrentWeightKg } from '../../lib/clientWeightCore'

function bmiFromHealthRow(health) {
  const hCm = Number(String(health?.height_cm ?? '').replace(',', '.'))
  const wKg = getHealthCurrentWeightKg(health)
  if (!Number.isFinite(hCm) || !Number.isFinite(wKg) || hCm <= 0 || wKg <= 0) return null
  const m = hCm / 100
  const v = wKg / (m * m)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

function HealthReadonly({ health }) {
  const bmi = useMemo(() => bmiFromHealthRow(health), [health])
  const currentKg = getHealthCurrentWeightKg(health)
  if (!health) return <p className="muted" style={{ margin: 0 }}>Медкарта не заведена или пуста.</p>
  const diseases = health.diseases ?? ''
  const contraindications = health.contraindications ?? ''
  const medications = health.medications ?? ''
  const notes = health.notes ?? ''
  const hasText = diseases || contraindications || medications || notes
  const hasMetrics = health.height_cm != null && health.height_cm !== '' && currentKg != null
  if (!hasText && !hasMetrics && bmi == null) {
    return <p className="muted" style={{ margin: 0 }}>В медкарте пока нет данных.</p>
  }
  return (
    <div className="grid health-mini" style={{ gap: 8 }}>
      {(health.height_cm != null && health.height_cm !== '') || currentKg != null || bmi != null ? (
        <div className="health-mini__top">
          <div className="health-mini__metric">
            <span className="muted">Рост</span>
            <strong>{health.height_cm != null && health.height_cm !== '' ? `${health.height_cm} см` : '—'}</strong>
          </div>
          <div className="health-mini__metric">
            <span className="muted">Текущий вес</span>
            <strong>{currentKg != null ? `${currentKg} кг` : '—'}</strong>
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
    </div>
  )
}

export function TrainerStatisticsSection() {
  const { user } = useAuth()
  const trainerId = user?.id ?? ''
  const trainerClubId = user?.club_id ?? null

  const [statsRange, setStatsRange] = useState({ start: '', end: '' })
  const [journalOpen, setJournalOpen] = useState(false)

  const [filteredTrainings, setFilteredTrainings] = useState([])
  const [clients, setClients] = useState({})
  const [journalSource, setJournalSource] = useState('local')
  const [journalFallback, setJournalFallback] = useState(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(ADMIN_JOURNAL_DEFAULT_PAGE_SIZE)
  const [previewTraining, setPreviewTraining] = useState(null)
  const [healthByClientId, setHealthByClientId] = useState({})
  const [busy, setBusy] = useState(false)
  const [memberships, setMemberships] = useState([])
  const [membershipTypes, setMembershipTypes] = useState([])
  const loadSeqRef = useRef(0)

  const totalCount = filteredTrainings.length
  const rows = useMemo(() => {
    const start = page * pageSize
    return filteredTrainings.slice(start, start + pageSize)
  }, [filteredTrainings, page, pageSize])

  const clientLinkTo = useCallback((id) => `/trainer/clients/${id}`, [])

  const onStatsRange = useCallback((r) => {
    setPage(0)
    setJournalOpen(false)
    if (!r?.start || !r?.end) {
      setStatsRange({ start: '', end: '' })
      return
    }
    setStatsRange({ start: r.start, end: r.end })
  }, [])

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

  const membershipsByClientId = useMemo(() => {
    const m = new Map()
    for (const row of memberships) {
      const cid = String(row?.client_id ?? '').trim()
      if (!cid) continue
      if (!m.has(cid)) m.set(cid, [])
      m.get(cid).push(row)
    }
    return m
  }, [memberships])

  const loadMembershipContext = useCallback(async () => {
    if (!trainerClubId) {
      setMemberships([])
      setMembershipTypes([])
      return
    }
    try {
      setMembershipTypes(await listMembershipTypesForClub(trainerClubId))
    } catch {
      setMembershipTypes([])
    }
    try {
      const rows = await loadClubMembershipsWithApiFallback(trainerClubId, { trainerId })
      setMemberships(rows)
    } catch {
      setMemberships([])
    }
  }, [trainerClubId])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!journalOpen || !trainerId || !statsRange.start || !statsRange.end) {
      setFilteredTrainings([])
      setClients({})
      setJournalSource('local')
      setJournalFallback(null)
      setHealthByClientId({})
      return
    }
    const seq = ++loadSeqRef.current
    if (!silent) setBusy(true)
    try {
      const j = await loadTrainerJournalFiltered({
        trainerId,
        clubId: trainerClubId,
        dateFrom: statsRange.start,
        dateTo: statsRange.end,
      })
      if (seq !== loadSeqRef.current) return
      setClients(j.clientsById)
      setFilteredTrainings(j.trainings)
      setJournalSource(j.source || 'local')
      setJournalFallback(j.fallbackReason ?? null)
    } catch {
      if (seq !== loadSeqRef.current) return
      setFilteredTrainings([])
      setClients({})
      setJournalSource('local')
      setJournalFallback('Не удалось загрузить журнал')
    } finally {
      if (seq === loadSeqRef.current && !silent) setBusy(false)
    }
  }, [journalOpen, trainerId, trainerClubId, statsRange.start, statsRange.end])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!rows.length) {
      setHealthByClientId({})
      return
    }
    let cancelled = false
    const clientIds = [...new Set(rows.map((t) => t.client_id).filter(Boolean))]
    void loadAdminHealthCardsByClientIds(clientIds).then((hc) => {
      if (!cancelled) setHealthByClientId(hc.healthByClientId ?? {})
    })
    return () => {
      cancelled = true
    }
  }, [rows])

  useEffect(() => {
    void loadMembershipContext()
  }, [loadMembershipContext])

  useEffect(() => {
    if (!journalOpen) return
    requestAnimationFrame(() => {
      document.getElementById('trainer-completed-trainings-journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [journalOpen])

  const openCompletedJournal = useCallback(() => {
    setJournalOpen(true)
    setPage(0)
  }, [])

  useDebouncedStorageReload(() => void load({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [totalCount, pageSize, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const rangeFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const rangeTo = totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount)
  const canPrev = page > 0
  const canNext = (page + 1) * pageSize < totalCount

  if (!trainerId) return null

  return (
    <>
      <TrainerPayrollPanel
        trainerId={trainerId}
        clubId={trainerClubId}
        membershipTypes={membershipTypes}
        memberships={memberships}
      />

      <AdminClubStatsSection
        clubId={trainerClubId ?? ''}
        trainerScope={{
          trainerId,
          clubId: trainerClubId,
          selfLabel: user?.name ?? '',
        }}
        onActiveRangeChange={onStatsRange}
        onOpenCompletedJournal={openCompletedJournal}
      />

      {journalOpen ? (
        <section className="card" id="trainer-completed-trainings-journal">
          <div className="td-section-head">
            <h2 className="section-title td-section-title" style={{ margin: 0 }}>
              Проведённые тренировки
            </h2>
            <div className="row td-actions">
              <button type="button" className="btn btn-ghost btn-touch" onClick={() => setJournalOpen(false)}>
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
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
            Завершённые тренировки по вашим клиентам за период (
            {statsRange.start && statsRange.end
              ? `${formatDateRu(statsRange.start)} — ${formatDateRu(statsRange.end)}`
              : '…'}
            ).{' '}
            {journalSource === 'api' || journalSource === 'remote' || journalSource === 'remote_partial' ? (
              <>
                Данные с <strong>сервера</strong>
                {journalSource === 'remote_partial' ? ' (частично)' : ''}.
              </>
            ) : (
              <>
                Данные с <strong>устройства</strong> (IndexedDB)
                {journalFallback ? ` · запасной режим: ${journalFallback}` : ''}.
              </>
            )}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>№ карты</th>
                  <th>Дата</th>
                  <th>Тип карты</th>
                  <th title="Просмотр" />
                  <th title="Карточка клиента" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{journalClientDisplayName(clients, t.client_id)}</td>
                    <td className="muted">{journalClientCardNumber(clients, t.client_id)}</td>
                    <td>{formatDateRu(t.date)}</td>
                    <td>{membershipCardTypeLabelForTraining(t, membershipById, typeCodeById, membershipsByClientId)}</td>
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
                        to={clientLinkTo(t.client_id)}
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
            style={{ flexWrap: 'wrap', gap: 12, marginTop: 12, alignItems: 'center', justifyContent: 'space-between' }}
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
        </section>
      ) : null}

      {previewTraining ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trainer-stat-view-title"
          onClick={() => setPreviewTraining(null)}
        >
          <div className="modal-panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <h2 id="trainer-stat-view-title" className="section-title td-section-title" style={{ margin: 0, flex: '1 1 auto' }}>
                Тренировка {formatDateRu(previewTraining.date)}
              </h2>
              <CloseButton touch onClick={() => setPreviewTraining(null)} size={20} />
            </div>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              Клиент: <strong>{journalClientDisplayName(clients, previewTraining.client_id)}</strong>{' '}
              <Link
                to={clientLinkTo(previewTraining.client_id)}
                className="u-no-decoration"
                style={{ color: 'var(--accent-bright)' }}
                onClick={() => setPreviewTraining(null)}
              >
                Карточка клиента
              </Link>
            </p>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              Карта здоровья
            </h3>
            <div style={{ marginBottom: 16 }}>
              <HealthReadonly health={healthByClientId[previewTraining.client_id]} />
            </div>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              Данные тренировки
            </h3>
            {previewTraining.data?.exercises?.length ? (
              <TrainingExercisesReadonly exercises={previewTraining.data.exercises} sessionType={previewTraining.type} />
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Нет упражнений в записи.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
