import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { pluralRu } from '../../lib/client/clientMeUiCore.js'
import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_MONTH,
  countScheduleEntriesByDay,
  listScheduleViewDays,
  shiftScheduleAnchorIso,
} from '../../lib/trainer/trainerScheduleCore.js'
import { useTrainerScheduleData } from '../../hooks/useTrainerScheduleData.js'
import { TrainerScheduleMonthGrid } from '../../components/trainer/TrainerScheduleMonthGrid.jsx'
import { TrainerScheduleMultiDayAgenda } from '../../components/trainer/TrainerScheduleMultiDayAgenda.jsx'
import { TrainerScheduleViewSwitcher } from '../../components/trainer/TrainerScheduleViewSwitcher.jsx'
import { TrainerScheduleEntryModal } from '../../components/trainer/TrainerScheduleEntryModal.jsx'
import { TrainerScheduleNotice } from '../../components/trainer/TrainerScheduleNotice.jsx'
import { useTrainerScheduleMove } from '../../hooks/useTrainerScheduleMove.js'
import '../../styles/trainer-schedule.css'
import '../../styles/trainer-schedule-interactions.css'
import '../../styles/trainer-schedule-kinds.css'

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

export function TrainerCalendarPage() {
  const { user } = useAuth()
  const today = todayInTimeZoneIso()
  const [view, setView] = useState(SCHEDULE_VIEW_MONTH)
  const [selectedDay, setSelectedDay] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => parseMonthCursor(today))
  const [modalDraft, setModalDraft] = useState(/** @type {object | null} */ (null))
  const [modalOpen, setModalOpen] = useState(false)

  const { entries, clients, clientNameById, trainingById, loading, reload } = useTrainerScheduleData(
    user?.id,
    user?.club_id,
  )

  const move = useTrainerScheduleMove({ onSaved: () => void reload({ silent: true }) })

  const countsByDay = useMemo(
    () => countScheduleEntriesByDay(entries, monthCursor.year, monthCursor.month),
    [entries, monthCursor.year, monthCursor.month],
  )

  const agendaDays = useMemo(() => listScheduleViewDays(selectedDay, view), [selectedDay, view])

  const openCreate = (dayIso, minutes) => {
    const day = String(dayIso ?? selectedDay).slice(0, 10)
    setSelectedDay(day)
    setMonthCursor(parseMonthCursor(day))
    setModalDraft({
      day_date: day,
      start_minutes: minutes,
      duration_minutes: 60,
      title: '',
      client_ids: [],
    })
    setModalOpen(true)
  }

  const openEdit = (entry) => {
    const day = String(entry?.day_date ?? selectedDay).slice(0, 10)
    if (day) {
      setSelectedDay(day)
      setMonthCursor(parseMonthCursor(day))
    }
    setModalDraft(entry)
    setModalOpen(true)
  }

  const onSelectDay = (iso) => {
    setSelectedDay(iso)
    setMonthCursor(parseMonthCursor(iso))
    setView(SCHEDULE_VIEW_DAY)
  }

  const onChangeView = (next) => {
    setView(next)
    if (next !== SCHEDULE_VIEW_MONTH) {
      setMonthCursor(parseMonthCursor(selectedDay))
    }
  }

  const shiftAnchor = (delta) => {
    const next = shiftScheduleAnchorIso(selectedDay, view, delta)
    setSelectedDay(next)
    setMonthCursor(parseMonthCursor(next))
  }

  const goToday = () => {
    const t = todayInTimeZoneIso()
    setSelectedDay(t)
    setMonthCursor(parseMonthCursor(t))
  }

  const wide = view !== SCHEDULE_VIEW_MONTH && agendaDays.length > 1

  return (
    <div className={['trainer-schedule-page', wide ? 'trainer-schedule-page--wide' : ''].filter(Boolean).join(' ')}>
      <header className="trainer-schedule-page__hero">
        <h1 className="trainer-schedule-page__title">Ежедневник</h1>
        <p className="trainer-schedule-page__subtitle muted">
          План дня: заметки и клиенты. Сохраняется на планшете и уходит в облако при Sync. Удерживайте
          запись, чтобы перенести её.
        </p>
        <TrainerScheduleViewSwitcher view={view} onChange={onChangeView} />
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
          onSelectDay={onSelectDay}
          onPrevMonth={() => setMonthCursor((c) => shiftMonth(c.year, c.month, -1))}
          onNextMonth={() => setMonthCursor((c) => shiftMonth(c.year, c.month, 1))}
        />
      ) : (
        <TrainerScheduleMultiDayAgenda
          dayIsos={agendaDays}
          anchorDayIso={selectedDay}
          entries={entries}
          clientNameById={clientNameById}
          trainingById={trainingById}
          onPrev={() => shiftAnchor(-1)}
          onNext={() => shiftAnchor(1)}
          onToday={goToday}
          onOpenDay={onSelectDay}
          onAddAt={openCreate}
          onOpenEntry={openEdit}
          onMoveEntry={(entry, dayIso, startMinutes) => void move.moveEntry(entry, dayIso, startMinutes)}
          onMoveLocked={move.showLocked}
        />
      )}

      <TrainerScheduleNotice notice={move.notice} onUndo={() => void move.undo()} onDismiss={move.dismiss} />

      <TrainerScheduleEntryModal
        open={modalOpen}
        draft={modalDraft}
        dayIso={selectedDay}
        clubId={String(user?.club_id ?? '')}
        trainerId={String(user?.id ?? '')}
        clients={clients}
        clientNameById={clientNameById}
        trainingById={trainingById}
        entries={entries}
        onClose={() => setModalOpen(false)}
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
