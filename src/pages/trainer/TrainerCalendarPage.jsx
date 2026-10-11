import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { pluralRu } from '../../lib/client/clientMeUiCore.js'
import { SCHEDULE_VIEW_MONTH, countScheduleEntriesByDay } from '../../lib/trainer/trainerScheduleCore.js'
import { useTrainerScheduleData } from '../../hooks/useTrainerScheduleData.js'
import { useScheduleCalendarNav } from '../../hooks/useScheduleCalendarNav.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleMultiDayAgenda } from '../../components/trainer/TrainerScheduleMultiDayAgenda.jsx'
import { TrainerScheduleViewMenu } from '../../components/trainer/TrainerScheduleViewMenu.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import { TrainerScheduleNotice } from '../../components/trainer/TrainerScheduleNotice.jsx'
import { useTrainerScheduleMove } from '../../hooks/useTrainerScheduleMove.js'
import '../../styles/trainer-schedule.css'
import '../../styles/trainer-schedule-interactions.css'
import '../../styles/trainer-schedule-kinds.css'

export function TrainerCalendarPage() {
  const { user } = useAuth()
  const nav = useScheduleCalendarNav()
  const { view, selectedDay, monthCursor, agendaDays } = nav

  const { entries, clients, clientNameById, trainingById, loading, reload } = useTrainerScheduleData(
    user?.id,
    user?.club_id,
  )

  const move = useTrainerScheduleMove({ onSaved: () => void reload({ silent: true }) })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )

  const wide = view !== SCHEDULE_VIEW_MONTH && agendaDays.length > 1
  const viewMenu = <TrainerScheduleViewMenu view={view} onChange={nav.onChangeView} onToday={nav.goToday} />

  return (
    <div className={['trainer-schedule-page', wide ? 'trainer-schedule-page--wide' : ''].filter(Boolean).join(' ')}>
      <header className="trainer-schedule-page__hero">
        <h1 className="trainer-schedule-page__title">Ежедневник</h1>
        <p className="trainer-schedule-page__subtitle muted">
          План дня: заметки и клиенты. Сохраняется на планшете и уходит в облако при Sync. Удерживайте
          запись, чтобы перенести её.
        </p>
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
          headEnd={viewMenu}
        />
      ) : (
        <TrainerScheduleMultiDayAgenda
          dayIsos={agendaDays}
          anchorDayIso={selectedDay}
          entries={entries}
          clientNameById={clientNameById}
          trainingById={trainingById}
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
        trainingById={trainingById}
        entries={entries}
        onClose={nav.closeModal}
        onSaved={(result) => {
          void reload({ silent: true })
          if (result?.repeated) {
            move.notify(`Добавлено ещё ${result.repeated} ${pluralRu(result.repeated, 'запись', 'записи', 'записей')}`)
          }
        }}
      />
    </div>
  )
}
