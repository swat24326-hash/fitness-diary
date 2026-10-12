import { useMemo, useState } from 'react'
import { todayInTimeZoneIso } from '../lib/dateRu.js'
import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_MONTH,
  listScheduleViewDays,
  shiftScheduleAnchorIso,
} from '../lib/trainer/trainerScheduleCore.js'
import { parseStoredScheduleView, scheduleViewStorageKey } from '../lib/trainer/scheduleViewPrefsCore.js'

/** @param {string} key @param {string} fallback */
function readView(key, fallback) {
  try {
    return parseStoredScheduleView(localStorage.getItem(key), fallback)
  } catch {
    return fallback
  }
}

/** @param {string} key @param {string} view */
function writeView(key, view) {
  try {
    localStorage.setItem(key, view)
  } catch {
    /* приватный режим — вид живёт до ухода с экрана */
  }
}

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
 * Вид из меню запоминается по `scope`; переход в «День» по тапу на дату — нет (это навигация, не выбор вида).
 * @param {{ scope: 'tablet' | 'phone' | 'admin', initialView?: string }} opts
 */
export function useScheduleCalendarNav({ scope, initialView = SCHEDULE_VIEW_MONTH }) {
  const today = todayInTimeZoneIso()
  const viewKey = scheduleViewStorageKey(scope)
  const [view, setView] = useState(() => readView(viewKey, initialView))
  const [selectedDay, setSelectedDay] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => parseMonthCursor(today))
  const [modalDraft, setModalDraft] = useState(/** @type {object | null} */ (null))
  const [modalOpen, setModalOpen] = useState(false)
  const [todayTick, setTodayTick] = useState(0)

  const agendaDays = useMemo(() => listScheduleViewDays(selectedDay, view), [selectedDay, view])
  /** Соседние экраны для листания пальцем: въезжают за пальцем уже с записями. */
  const agendaPrevDays = useMemo(
    () => listScheduleViewDays(shiftScheduleAnchorIso(selectedDay, view, -1), view),
    [selectedDay, view],
  )
  const agendaNextDays = useMemo(
    () => listScheduleViewDays(shiftScheduleAnchorIso(selectedDay, view, 1), view),
    [selectedDay, view],
  )

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
    writeView(viewKey, next)
    if (next !== SCHEDULE_VIEW_MONTH) setMonthCursor(parseMonthCursor(selectedDay))
  }

  return {
    view,
    selectedDay,
    monthCursor,
    agendaDays,
    agendaPrevDays,
    agendaNextDays,
    modalDraft,
    modalOpen,
    openCreate,
    openEdit,
    closeModal: () => setModalOpen(false),
    onSelectDay,
    onChangeView,
    shiftAnchor: (delta) => focusDay(shiftScheduleAnchorIso(selectedDay, view, delta)),
    /** Растёт на каждое «Сегодня» — сетка докручивает к текущему часу, даже если день не сменился. */
    todayTick,
    goToday: () => {
      focusDay(todayInTimeZoneIso())
      setTodayTick((n) => n + 1)
    },
    prevMonth: () => setMonthCursor((c) => shiftMonth(c.year, c.month, -1)),
    nextMonth: () => setMonthCursor((c) => shiftMonth(c.year, c.month, 1)),
    pickMonth: (year, month) => setMonthCursor({ year, month }),
  }
}
