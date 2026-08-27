import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { countScheduleEntriesByDay } from '../../lib/trainer/trainerScheduleCore.js'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient.js'
import { useClubTrainerScheduleData } from '../../hooks/useClubTrainerScheduleData.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleDayAgenda } from '../../components/trainer/TrainerScheduleDayAgenda.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import '../../styles/trainer-schedule.css'

function parseMonthCursor(iso) {
  const day = String(iso ?? '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(day)
  if (!m) {
    const t = todayInTimeZoneIso()
    const tm = /^(\d{4})-(\d{2})-\d{2}$/.exec(t)
    return { year: Number(tm?.[1] ?? 2026), month: Number(tm?.[2] ?? 1) }
  }
  return { year: Number(m[1]), month: Number(m[2]) }
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Ежедневники тренеров клуба — read-only для админа и управляющего.
 * @param {{ accessMode?: 'admin' | 'supervisor' }} [props]
 */
export function ClubTrainerSchedulePage({ accessMode = 'admin' } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const outlet = useOutletContext()
  const { user, isSupervisor } = useAuth()
  const isSup = accessMode === 'supervisor' || isSupervisor

  const clubId = useMemo(() => {
    if (isSup) {
      return (
        String(outlet?.clubId ?? '').trim() ||
        String(user?.club_id ?? '').trim() ||
        String(searchParams.get('club') ?? '').trim()
      )
    }
    return String(searchParams.get('club') ?? '').trim() || String(outlet?.clubId ?? '').trim()
  }, [isSup, outlet?.clubId, searchParams, user?.club_id])

  const today = todayInTimeZoneIso()
  const [view, setView] = useState('month')
  const [selectedDay, setSelectedDay] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => parseMonthCursor(today))
  const [trainerFilter, setTrainerFilter] = useState(() => String(searchParams.get('trainer') ?? '').trim())
  const [trainers, setTrainers] = useState([])
  const [trainersLoading, setTrainersLoading] = useState(false)
  const [modalEntry, setModalEntry] = useState(/** @type {object | null} */ (null))
  const [modalOpen, setModalOpen] = useState(false)

  const clientsBase = isSup ? '/club/clients' : '/admin/clients'
  const homeHref = isSup ? '/club' : '/admin'

  useEffect(() => {
    if (!clubId) {
      setTrainers([])
      return
    }
    let cancelled = false
    setTrainersLoading(true)
    void (async () => {
      try {
        const res = await fetchTrainersViaAdminApi({ role: 'trainer' })
        const list = (res?.trainers ?? []).filter((t) => String(t?.club_id ?? '') === clubId)
        if (!cancelled) setTrainers(list)
      } catch {
        if (!cancelled) setTrainers([])
      } finally {
        if (!cancelled) setTrainersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (trainerFilter) next.set('trainer', trainerFilter)
    else next.delete('trainer')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [trainerFilter, searchParams, setSearchParams])

  const { entries, clientNameById, trainerNameById, trainingById, loading, error, truncated } =
    useClubTrainerScheduleData({
      clubId,
      trainerId: trainerFilter,
      year: monthCursor.year,
      month: monthCursor.month,
    })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )

  const onSelectDay = (iso) => {
    setSelectedDay(iso)
    setMonthCursor(parseMonthCursor(iso))
    setView('day')
  }

  const openView = (entry) => {
    setModalEntry(entry)
    setModalOpen(true)
  }

  return (
    <div className="trainer-schedule-page admin-trainer-schedule-page">
      <header className="trainer-schedule-page__hero">
        <div className="admin-trainer-schedule-page__head-row">
          <div>
            <h1 className="trainer-schedule-page__title">
              <CalendarDays size={28} aria-hidden className="admin-trainer-schedule-page__title-icon" />
              Ежедневники тренеров
            </h1>
            <p className="trainer-schedule-page__subtitle muted">
              План дня тренеров клуба — только просмотр. Редактирует тренер на планшете.
            </p>
          </div>
          <Link className="btn btn-secondary btn-sm" to={homeHref}>
            ← На главную
          </Link>
        </div>
      </header>

      {!clubId ? (
        <p className="muted admin-trainer-schedule-page__empty" role="status">
          {isSup
            ? 'Клуб не привязан к учётке — ежедневники недоступны.'
            : 'Выберите клуб в шапке, чтобы открыть ежедневники тренеров.'}
        </p>
      ) : (
        <>
          <div className="admin-trainer-schedule-page__filters card">
            <label className="admin-trainer-schedule-page__filter">
              <span>Тренер</span>
              <select
                value={trainerFilter}
                onChange={(ev) => setTrainerFilter(ev.target.value)}
                disabled={trainersLoading}
              >
                <option value="">Все тренеры</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || 'Тренер'}
                  </option>
                ))}
              </select>
            </label>
            {truncated ? (
              <p className="admin-trainer-schedule-page__warn muted" role="status">
                Показаны не все записи месяца — сузьте фильтр по тренеру.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="trainer-schedule-page__error" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? <p className="muted trainer-schedule-page__loading" role="status">Загрузка расписания…</p> : null}

          {view === 'month' ? (
            <TrainerScheduleMonthGrid
              year={monthCursor.year}
              month={monthCursor.month}
              selectedDay={selectedDay}
              countsByDay={countsByDay}
              onSelectDay={onSelectDay}
              onPrevMonth={() => setMonthCursor((c) => shiftMonth(c.year, c.month, -1))}
              onNextMonth={() => setMonthCursor((c) => shiftMonth(c.year, c.month, 1))}
            />
          ) : (
            <TrainerScheduleDayAgenda
              dayIso={selectedDay}
              entries={entries}
              clientNameById={clientNameById}
              trainerNameById={trainerNameById}
              trainingById={trainingById}
              readOnly
              showTrainerName={!trainerFilter}
              onBack={() => setView('month')}
              onAddAtMinutes={() => {}}
              onOpenEntry={openView}
            />
          )}
        </>
      )}

      <TrainerScheduleEntryModal
        open={modalOpen}
        draft={modalEntry}
        dayIso={selectedDay}
        clubId={clubId}
        trainerId={String(modalEntry?.trainer_id ?? '')}
        clients={[]}
        clientNameById={clientNameById}
        trainerNameById={trainerNameById}
        trainingById={trainingById}
        readOnly
        clientsBase={clientsBase}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
      />
    </div>
  )
}
