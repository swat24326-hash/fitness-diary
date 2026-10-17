import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { pluralRu } from '../../lib/client/clientMeUiCore.js'
import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_DAYS3,
  SCHEDULE_VIEW_MONTH,
  SCHEDULE_VIEW_WEEK,
  countScheduleEntriesByDay,
} from '../../lib/trainer/trainerScheduleCore.js'
import { resolveCoachScheduleWindow } from '../../lib/trainer/coachScheduleEditCore.js'
import { createCoachScheduleActions } from '../../lib/coach/coachScheduleActions.js'
import { useScheduleCalendarNav } from '../../hooks/useScheduleCalendarNav.js'
import { useTrainerScheduleMove } from '../../hooks/useTrainerScheduleMove.js'
import { useScheduleZoom } from '../../hooks/useScheduleZoom.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleMultiDayAgenda } from '../../components/trainer/TrainerScheduleMultiDayAgenda.jsx'
import { TrainerScheduleViewMenu } from '../../components/trainer/TrainerScheduleViewMenu.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import { TrainerScheduleNotice } from '../../components/trainer/TrainerScheduleNotice.jsx'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachInstallBanner } from './CoachInstallBanner.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'
import { useCoachScheduleData } from './useCoachScheduleData.js'
import '../../styles/trainer-schedule.css'
import '../../styles/trainer-schedule-interactions.css'
import '../../styles/trainer-schedule-kinds.css'
import '../../styles/trainer-schedule-view.css'

/** Как в Google Календаре на телефоне: неделя пн–вс, листание пальцем вместо стрелок. */
const PHONE_VIEWS = [SCHEDULE_VIEW_DAY, SCHEDULE_VIEW_DAYS3, SCHEDULE_VIEW_WEEK, SCHEDULE_VIEW_MONTH]

/** Главный экран телефона — Ежедневник: тот же календарь, что на планшете, правки сразу на сервер (без очереди). */
export function CoachCalendarPage() {
  const { onSessionGone } = useCoachApp()
  const nav = useScheduleCalendarNav({ scope: 'phone', initialView: SCHEDULE_VIEW_DAY })
  const { view, selectedDay, monthCursor, agendaDays } = nav
  /** По умолчанию час = 60px (на планшете 84): на экране телефона виден больший кусок дня. */
  const zoom = useScheduleZoom('phone')
  const range = resolveCoachScheduleWindow(
    monthCursor.year,
    monthCursor.month,
    view === SCHEDULE_VIEW_MONTH ? [] : [...nav.agendaPrevDays, ...agendaDays, ...nav.agendaNextDays],
  )
  const data = useCoachScheduleData(range.from, range.to)
  const { entries, clients, clientNameById, clientInfoById, trainingById, reload } = data

  const actions = useMemo(
    () => createCoachScheduleActions({ onStale: () => void reload(), onSessionGone }),
    [reload, onSessionGone],
  )
  const move = useTrainerScheduleMove({ onSaved: () => void reload(), move: actions.move })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )
  const firstLoad = data.status !== 'ready' && !entries.length && !clients.length
  const viewMenu = (
    <TrainerScheduleViewMenu
      view={view}
      onChange={nav.onChangeView}
      views={PHONE_VIEWS}
      onToday={nav.goToday}
      zoom={view === SCHEDULE_VIEW_MONTH ? undefined : zoom}
    />
  )

  return (
    <CoachShell fill>
      <CoachInstallBanner />
      <div className="coach-schedule">
        {firstLoad || data.status === 'error' ? (
          <CoachLoadState status={data.status} error={data.error} onRetry={() => void reload()} />
        ) : view === SCHEDULE_VIEW_MONTH ? (
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
            anchorDayIso={selectedDay}
            entries={entries}
            clientNameById={clientNameById}
            clientInfoById={clientInfoById}
            trainingById={trainingById}
            canStartTraining={false}
            pxPerMin={zoom.zoom}
            onZoom={zoom.setZoom}
            swipeNav
            onPrev={() => nav.shiftAnchor(-1)}
            onNext={() => nav.shiftAnchor(1)}
            onOpenDay={nav.onSelectDay}
            onAddAt={nav.openCreate}
            onOpenEntry={nav.openEdit}
            onMoveEntry={(entry, dayIso, startMinutes) => void move.moveEntry(entry, dayIso, startMinutes)}
            onMoveLocked={move.showLocked}
            headEnd={viewMenu}
            addFab
            todayTick={nav.todayTick}
          />
        )}
      </div>

      {createPortal(
        <div className="coach-schedule-layer">
          <TrainerScheduleNotice notice={move.notice} onUndo={() => void move.undo()} onDismiss={move.dismiss} />
          <TrainerScheduleEntryModal
            open={nav.modalOpen}
            draft={nav.modalDraft}
            dayIso={selectedDay}
            clubId=""
            trainerId=""
            clients={clients}
            clientNameById={clientNameById}
            clientInfoById={clientInfoById}
            trainingById={trainingById}
            entries={entries}
            actions={actions}
            canStartTraining={false}
            onClose={nav.closeModal}
            onSaved={(result) => {
              void reload()
              if (result?.repeated) {
                move.notify(`Добавлено ещё ${result.repeated} ${pluralRu(result.repeated, 'запись', 'записи', 'записей')}`)
              }
            }}
          />
        </div>,
        document.body,
      )}
    </CoachShell>
  )
}
