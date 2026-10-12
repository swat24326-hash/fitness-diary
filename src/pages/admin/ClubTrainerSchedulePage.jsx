import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { SCHEDULE_VIEW_MONTH, countScheduleEntriesByDay } from '../../lib/trainer/trainerScheduleCore.js'
import { resolveScheduleMonthWindow } from '../../lib/admin/trainerScheduleAdminCore.js'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient.js'
import { useClubTrainerScheduleData } from '../../hooks/useClubTrainerScheduleData.js'
import { useScheduleCalendarNav } from '../../hooks/useScheduleCalendarNav.js'
import { useScheduleZoom } from '../../hooks/useScheduleZoom.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleMultiDayAgenda } from '../../components/trainer/TrainerScheduleMultiDayAgenda.jsx'
import { TrainerScheduleViewMenu } from '../../components/trainer/TrainerScheduleViewMenu.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import { ClubTrainerFilter } from './ClubTrainerFilter.jsx'
import '../../styles/trainer-schedule.css'
import '../../styles/trainer-schedule-interactions.css'
import '../../styles/trainer-schedule-kinds.css'
import '../../styles/admin-trainer-schedule.css'

/**
 * Ежедневники тренеров клуба — read-only для админа и управляющего (монитор: вся ширина, тренер в один клик).
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

  const nav = useScheduleCalendarNav({ scope: 'admin', initialView: SCHEDULE_VIEW_MONTH })
  const { view, selectedDay, monthCursor, agendaDays } = nav
  const zoom = useScheduleZoom('admin')
  const [trainerFilter, setTrainerFilter] = useState(() => String(searchParams.get('trainer') ?? '').trim())
  const [trainers, setTrainers] = useState([])
  const [trainersLoading, setTrainersLoading] = useState(false)

  const clientsBase = isSup ? '/club/clients' : '/admin/clients'
  const homeHref = isSup ? '/club' : '/admin'

  const loadRange = useMemo(() => {
    if (view === SCHEDULE_VIEW_MONTH) {
      const window = resolveScheduleMonthWindow(monthCursor.year, monthCursor.month)
      return window ?? { dayFrom: selectedDay, dayTo: selectedDay }
    }
    if (!agendaDays.length) return { dayFrom: selectedDay, dayTo: selectedDay }
    return { dayFrom: agendaDays[0], dayTo: agendaDays[agendaDays.length - 1] }
  }, [view, monthCursor.year, monthCursor.month, agendaDays, selectedDay])

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
        const list = (res?.trainers ?? []).filter(
          (t) => String(t?.club_id ?? '') === clubId && t?.is_active !== false,
        )
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
      dayFrom: loadRange.dayFrom,
      dayTo: loadRange.dayTo,
    })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )

  const viewMenu = (
    <TrainerScheduleViewMenu
      view={view}
      onChange={nav.onChangeView}
      onToday={nav.goToday}
      zoom={view === SCHEDULE_VIEW_MONTH ? undefined : zoom}
    />
  )

  return (
    <div className="trainer-schedule-page admin-trainer-schedule-page">
      <header className="trainer-schedule-page__hero">
        <div className="admin-trainer-schedule-page__head-row">
          <div>
            <h1 className="trainer-schedule-page__title">
              <CalendarDays size={28} aria-hidden className="admin-trainer-schedule-page__title-icon" />
              Ежедневники тренеров
              <span className="admin-trainer-schedule-page__readonly">Только просмотр</span>
            </h1>
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
          <ClubTrainerFilter
            trainers={trainers}
            value={trainerFilter}
            onChange={setTrainerFilter}
            loading={trainersLoading}
          />
          {truncated ? (
            <p className="admin-trainer-schedule-page__warn muted" role="status">
              Показаны не все записи периода — выберите одного тренера.
            </p>
          ) : null}
          {error ? (
            <p className="trainer-schedule-page__error" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p className="muted trainer-schedule-page__loading" role="status">
              Загрузка расписания…
            </p>
          ) : null}

          {view === SCHEDULE_VIEW_MONTH ? (
            <TrainerScheduleMonthGrid
              year={monthCursor.year}
              month={monthCursor.month}
              selectedDay={selectedDay}
              countsByDay={countsByDay}
              showCounts
              onSelectDay={nav.onSelectDay}
              onPrevMonth={nav.prevMonth}
              onNextMonth={nav.nextMonth}
              onPickMonth={nav.pickMonth}
              headEnd={viewMenu}
            />
          ) : (
            <TrainerScheduleMultiDayAgenda
              dayIsos={agendaDays}
              anchorDayIso={selectedDay}
              entries={entries}
              clientNameById={clientNameById}
              trainerNameById={trainerNameById}
              trainingById={trainingById}
              readOnly
              showTrainerName={!trainerFilter}
              pxPerMin={zoom.zoom}
              onZoom={zoom.setZoom}
              onPrev={() => nav.shiftAnchor(-1)}
              onNext={() => nav.shiftAnchor(1)}
              onOpenDay={nav.onSelectDay}
              onAddAt={() => {}}
              onOpenEntry={nav.openEdit}
              headEnd={viewMenu}
              todayTick={nav.todayTick}
            />
          )}
        </>
      )}

      <TrainerScheduleEntryModal
        open={nav.modalOpen}
        draft={nav.modalDraft}
        dayIso={selectedDay}
        clubId={clubId}
        trainerId={String(nav.modalDraft?.trainer_id ?? '')}
        clients={[]}
        clientNameById={clientNameById}
        trainerNameById={trainerNameById}
        trainingById={trainingById}
        readOnly
        clientsBase={clientsBase}
        onClose={nav.closeModal}
        onSaved={() => {}}
      />
    </div>
  )
}
