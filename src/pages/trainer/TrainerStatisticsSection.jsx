import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Eye, RefreshCw, UserCircle, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { loadAdminHealthCardsByClientIds } from '../../lib/dataAccess'
import { loadTrainerJournalPage } from '../../lib/trainer/trainerJournalService'
import { useDebouncedStorageReload, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import {
  ADMIN_JOURNAL_DEFAULT_PAGE_SIZE,
  ADMIN_JOURNAL_PAGE_SIZE_OPTIONS,
} from '../../lib/admin/adminConstants'
import { formatDateRu } from '../../lib/dateRu'
import { membershipCardTypeLabelForTraining } from '../../lib/admin/membershipTypeStatsAgg'
import { getDb } from '../../lib/localDb'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { AdminClubStatNotRenewedPanel } from '../../components/AdminClubStatNotRenewedPanel'
import { AdminInactiveClientsPanel } from '../../components/AdminInactiveClientsPanel'
import { TrainingExercisesReadonly } from '../../components/TrainingExercisesReadonly'
import { AdminClubStatsSection } from '../admin/AdminClubStatsSection'

function bmiFromHealthRow(health) {
  const hCm = Number(String(health?.height_cm ?? '').replace(',', '.'))
  const wKg = Number(String(health?.weight_kg ?? '').replace(',', '.'))
  if (!Number.isFinite(hCm) || !Number.isFinite(wKg) || hCm <= 0 || wKg <= 0) return null
  const m = hCm / 100
  const v = wKg / (m * m)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

function HealthReadonly({ health }) {
  const bmi = useMemo(() => bmiFromHealthRow(health), [health])
  if (!health) return <p className="muted" style={{ margin: 0 }}>Медкарта не заведена или пуста.</p>
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
    </div>
  )
}

export function TrainerStatisticsSection() {
  const { user } = useAuth()
  const trainerId = user?.id ?? ''
  const trainerClubId = user?.club_id ?? null

  const [statsRange, setStatsRange] = useState({ start: '', end: '' })
  const [journalOpen, setJournalOpen] = useState(false)
  const [notRenewedOpen, setNotRenewedOpen] = useState(false)
  const [notRenewedClients, setNotRenewedClients] = useState([])
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [inactiveClients, setInactiveClients] = useState([])

  const [rows, setRows] = useState([])
  const [clients, setClients] = useState({})
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(ADMIN_JOURNAL_DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [previewTraining, setPreviewTraining] = useState(null)
  const [healthByClientId, setHealthByClientId] = useState({})
  const [busy, setBusy] = useState(false)
  const [memberships, setMemberships] = useState([])
  const [membershipTypes, setMembershipTypes] = useState([])

  const clientLinkTo = useCallback((id) => `/trainer/clients/${id}`, [])

  const onStatsRange = useCallback((r) => {
    setPage(0)
    setJournalOpen(false)
    setNotRenewedOpen(false)
    setInactiveOpen(false)
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
      const db = await getDb()
      const all = await db.getAll('memberships')
      setMemberships(all.filter((m) => m.club_id === trainerClubId))
    } catch {
      setMemberships([])
    }
  }, [trainerClubId])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!journalOpen || !trainerId || !statsRange.start || !statsRange.end) {
      setRows([])
      setClients({})
      setTotalCount(0)
      setHealthByClientId({})
      return
    }
    if (!silent) setBusy(true)
    try {
      const j = await loadTrainerJournalPage({
        trainerId,
        clubId: trainerClubId,
        page,
        pageSize,
        dateFrom: statsRange.start,
        dateTo: statsRange.end,
      })
      setClients(j.clientsById)
      setRows(j.trainings)
      setTotalCount(typeof j.totalCount === 'number' ? j.totalCount : j.trainings.length)

      const clientIdsOnPage = [...new Set(j.trainings.map((t) => t.client_id).filter(Boolean))]
      const hc = await loadAdminHealthCardsByClientIds(clientIdsOnPage)
      setHealthByClientId(hc.healthByClientId ?? {})
    } catch {
      setRows([])
      setClients({})
      setTotalCount(0)
      setHealthByClientId({})
    } finally {
      if (!silent) setBusy(false)
    }
  }, [journalOpen, trainerId, trainerClubId, page, pageSize, statsRange.start, statsRange.end])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!journalOpen) return
    void loadMembershipContext()
    requestAnimationFrame(() => {
      document.getElementById('trainer-completed-trainings-journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [journalOpen, loadMembershipContext])

  const openCompletedJournal = useCallback(() => {
    setNotRenewedOpen(false)
    setInactiveOpen(false)
    setJournalOpen(true)
    setPage(0)
  }, [])

  const openNotRenewed = useCallback((list) => {
    setJournalOpen(false)
    setInactiveOpen(false)
    setNotRenewedClients(Array.isArray(list) ? list : [])
    setNotRenewedOpen(true)
  }, [])

  const openInactive = useCallback((list) => {
    setJournalOpen(false)
    setNotRenewedOpen(false)
    setInactiveClients(Array.isArray(list) ? list : [])
    setInactiveOpen(true)
  }, [])

  useEffect(() => {
    if (!notRenewedOpen) return
    requestAnimationFrame(() => {
      document.getElementById('trainer-not-renewed-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [notRenewedOpen])

  useEffect(() => {
    if (!inactiveOpen) return
    requestAnimationFrame(() => {
      document.getElementById('trainer-inactive-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [inactiveOpen])

  useDebouncedStorageReload(() => void load({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const rangeFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const rangeTo = totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount)
  const canPrev = page > 0 && !busy
  const canNext = !busy && (page + 1) * pageSize < totalCount

  if (!trainerId) return null

  return (
    <>
      <AdminClubStatsSection
        clubId={trainerClubId ?? ''}
        trainerScope={{
          trainerId,
          clubId: trainerClubId,
          selfLabel: user?.name ?? '',
        }}
        onActiveRangeChange={onStatsRange}
        onOpenCompletedJournal={openCompletedJournal}
        onOpenNotRenewed={openNotRenewed}
        onOpenInactive={openInactive}
      />

      {notRenewedOpen ? (
        <section className="card" id="trainer-not-renewed-panel">
          <div className="td-section-head">
            <h2 className="section-title td-section-title" style={{ margin: 0 }}>
              Не продлилось — {notRenewedClients.length}
            </h2>
            <button type="button" className="btn btn-ghost btn-touch" onClick={() => setNotRenewedOpen(false)}>
              Скрыть
            </button>
          </div>
          {statsRange.start && statsRange.end ? (
            <AdminClubStatNotRenewedPanel
              clients={notRenewedClients}
              dateFrom={statsRange.start}
              dateTo={statsRange.end}
              clientLinkTo={clientLinkTo}
              scopeLabel="trainer"
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Выберите период в сводке выше.
            </p>
          )}
        </section>
      ) : null}

      {inactiveOpen ? (
        <section className="card" id="trainer-inactive-panel">
          <div className="td-section-head">
            <h2 className="section-title td-section-title" style={{ margin: 0 }}>
              Не активные — {inactiveClients.length}
            </h2>
            <button type="button" className="btn btn-ghost btn-touch" onClick={() => setInactiveOpen(false)}>
              Скрыть
            </button>
          </div>
          {statsRange.start && statsRange.end ? (
            <AdminInactiveClientsPanel
              clients={inactiveClients}
              dateFrom={statsRange.start}
              dateTo={statsRange.end}
              clientLinkTo={clientLinkTo}
              scopeLabel="trainer"
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Выберите период в сводке выше.
            </p>
          )}
        </section>
      ) : null}

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
            {statsRange.start && statsRange.end ? `${formatDateRu(statsRange.start)} — ${formatDateRu(statsRange.end)}` : '…'}). Данные с{' '}
            <strong>устройства</strong> (IndexedDB).
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
                    <td>{clients[t.client_id]?.name ?? t.client_id}</td>
                    <td className="muted">{String(clients[t.client_id]?.card_number ?? '').trim() || '—'}</td>
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
              <div className="row" style={{ gap: 6 }}>
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
              <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={() => setPreviewTraining(null)} aria-label="Закрыть">
                <X size={20} aria-hidden />
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              Клиент: <strong>{clients[previewTraining.client_id]?.name ?? previewTraining.client_id}</strong>{' '}
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
