import { useMemo, useState } from 'react'
import { todayInTimeZoneIso } from '../lib/dateRu.js'
import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_MONTH,
  listScheduleViewDays,
  shiftScheduleAnchorIso,
} from '../lib/trainer/trainerScheduleCore.js'

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
 * Навигация Ежедневника (вид, выбранный день, месяц, модалка записи) — общая для планшета и телефона.
 * @param {{ initialView?: string }} [opts]
 */
export function useScheduleCalendarNav({ initialView = SCHEDULE_VIEW_MONTH } = {}) {
  const today = todayInTimeZoneIso()
  const [view, setView] = useState(initialView)
  const [selectedDay, setSelectedDay] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => parseMonthCursor(today))
  const [modalDraft, setModalDraft] = useState(/** @type {object | null} */ (null))
  const [modalOpen, setModalOpen] = useState(false)

  const agendaDays = useMemo(() => listScheduleViewDays(selectedDay, view), [selectedDay, view])

  const focusDay = (iso) => {
    setSelectedDay(iso)
    setMonthCursor(parseMonthCursor(iso))
  }

  const openCreate = (dayIso, minutes) => {
    const day = String(dayIso ?? selectedDay).slice(0, 10)
    focusDay(day)
    setModalDraft({ day_date: day, start_minutes: minutes, duration_minutes: 60, title: '', client_ids: [] })
    setModalOpen(true)
  }

  const openEdit = (entry) => {
    const day = String(entry?.day_date ?? selectedDay).slice(0, 10)
    if (day) focusDay(day)
    setModalDraft(entry)
    setModalOpen(true)
  }

  const onSelectDay = (iso) => {
    focusDay(iso)
    setView(SCHEDULE_VIEW_DAY)
  }

  const onChangeView = (next) => {
    setView(next)
    if (next !== SCHEDULE_VIEW_MONTH) setMonthCursor(parseMonthCursor(selectedDay))
  }

  return {
    view,
    selectedDay,
    monthCursor,
    agendaDays,
    modalDraft,
    modalOpen,
    openCreate,
    openEdit,
    closeModal: () => setModalOpen(false),
    onSelectDay,
    onChangeView,
    shiftAnchor: (delta) => focusDay(shiftScheduleAnchorIso(selectedDay, view, delta)),
    goToday: () => focusDay(todayInTimeZoneIso()),
    prevMonth: () => setMonthCursor((c) => shiftMonth(c.year, c.month, -1)),
    nextMonth: () => setMonthCursor((c) => shiftMonth(c.year, c.month, 1)),
  }
}
