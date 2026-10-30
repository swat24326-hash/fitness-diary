import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { pluralRu } from '../../lib/client/clientMeUiCore.js'
import { SCHEDULE_VIEW_MONTH, countScheduleEntriesByDay } from '../../lib/trainer/trainerScheduleCore.js'
import { useTrainerScheduleData } from '../../hooks/useTrainerScheduleData.js'
import { useScheduleCalendarNav } from '../../hooks/useScheduleCalendarNav.js'
import { useScheduleZoom } from '../../hooks/useScheduleZoom.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleMultiDayAgenda } from '../../components/trainer/TrainerScheduleMultiDayAgenda.jsx'
import { TrainerScheduleViewMenu } from '../../components/trainer/TrainerScheduleViewMenu.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import { TrainerScheduleNotice } from '../../components/trainer/TrainerScheduleNotice.jsx'
import { useTrainerScheduleMove } from '../../hooks/useTrainerScheduleMove.js'
import { useScheduleAzDirections } from '../../hooks/useScheduleAzDirections.js'
import { waitScheduleEntryDelivery } from '../../lib/trainer/trainerScheduleDeliveryService.js'
import '../../styles/trainer-schedule.css'
import '../../styles/trainer-schedule-interactions.css'
import '../../styles/trainer-schedule-kinds.css'
import '../../styles/trainer-schedule-view.css'

export function TrainerCalendarPage() {
  const { user } = useAuth()
  const nav = useScheduleCalendarNav({ scope: 'tablet' })
  const { view, selectedDay, monthCursor, agendaDays } = nav
  const zoom = useScheduleZoom('tablet')

  const { entries, clients, clientNameById, clientInfoById, trainingById, loading, reload } =
    useTrainerScheduleData(user?.id, user?.club_id)
  const azDirections = useScheduleAzDirections(user?.club_id)

  const move = useTrainerScheduleMove({
    onSaved: () => void reload({ silent: true }),
    confirmDelivery: waitScheduleEntryDelivery,
  })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )

  const wide = view !== SCHEDULE_VIEW_MONTH && agendaDays.length > 1
  const viewMenu = (
    <TrainerScheduleViewMenu
      view={view}
      onChange={nav.onChangeView}
      onToday={nav.goToday}
      zoom={view === SCHEDULE_VIEW_MONTH ? undefined : zoom}
    />
  )

  return (
    <div className={['trainer-schedule-page', wide ? 'trainer-schedule-page--wide' : ''].filter(Boolean).join(' ')}>
      <header className="trainer-schedule-page__hero">
        <h1 className="trainer-schedule-page__title">Ежедневник</h1>
      </header>

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
          onSelectDay={nav.onSelectDay}
          onPrevMonth={nav.prevMonth}
          onNextMonth={nav.nextMonth}
          onPickMonth={nav.pickMonth}
          swipeNav
          headEnd={viewMenu}
        />
      ) : (
        <TrainerScheduleMultiDayAgenda
          dayIsos={agendaDays}
          prevDayIsos={nav.agendaPrevDays}
          nextDayIsos={nav.agendaNextDays}
          swipeNav
          anchorDayIso={selectedDay}
          entries={entries}
          clientNameById={clientNameById}
          clientInfoById={clientInfoById}
          trainingById={trainingById}
          pxPerMin={zoom.zoom}
          onZoom={zoom.setZoom}
          onPrev={() => nav.shiftAnchor(-1)}
          onNext={() => nav.shiftAnchor(1)}
          headEnd={viewMenu}
          addFab
          todayTick={nav.todayTick}
          onOpenDay={nav.onSelectDay}
          onAddAt={nav.openCreate}
          onOpenEntry={nav.openEdit}
          onMoveEntry={(entry, dayIso, startMinutes) => void move.moveEntry(entry, dayIso, startMinutes)}
          onMoveLocked={move.showLocked}
        />
      )}

      <TrainerScheduleNotice notice={move.notice} onUndo={() => void move.undo()} onDismiss={move.dismiss} />

      <TrainerScheduleEntryModal
        open={nav.modalOpen}
        draft={nav.modalDraft}
        dayIso={selectedDay}
        clubId={String(user?.club_id ?? '')}
        trainerId={String(user?.id ?? '')}
        clients={clients}
        clientNameById={clientNameById}
        clientInfoById={clientInfoById}
        trainingById={trainingById}
        entries={entries}
        azDirections={azDirections}
        onClose={nav.closeModal}
        onSaved={(result) => {
          void reload({ silent: true })
          if (result?.repeated) {
            move.notify(`Добавлено ещё ${result.repeated} ${pluralRu(result.repeated, 'запись', 'записи', 'записей')}`)
          } else {
            move.announceSavedMove(result?.prev, result?.entry)
          }
        }}
      />
    </div>
  )
}
