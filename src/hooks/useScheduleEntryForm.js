import { useEffect, useMemo, useState } from 'react'
import {
  SCHEDULE_DEFAULT_DURATION_MIN,
  buildScheduleEntryLabel,
  formatScheduleMinutes,
  normalizeScheduleClientIds,
  parseScheduleTimeToMinutes,
} from '../lib/trainer/trainerScheduleCore.js'
import {
  SCHEDULE_REPEAT_DEFAULT_WEEKS,
  planScheduleRepeatCopies,
  scheduleWeekdayIndex,
} from '../lib/trainer/trainerScheduleRecurrenceCore.js'
import {
  SCHEDULE_KIND_TRAINING,
  resolveScheduleEntryKind,
  scheduleKindFormMode,
  scheduleKindRequiresClients,
} from '../lib/trainer/trainerScheduleKindCore.js'
import { todayInTimeZoneIso } from '../lib/dateRu.js'

/**
 * Поля формы записи Ежедневника (планшет и телефон): заполнение из записи, повтор, проверка перед сохранением.
 * @param {{ open: boolean, draft: object | null, dayIso: string, entries: object[], clientNameById: Record<string, string> }} p
 */
export function useScheduleEntryForm({ open, draft, dayIso, entries, clientNameById }) {
  const [mode, setMode] = useState('clients')
  const [kind, setKind] = useState('personal')
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(SCHEDULE_DEFAULT_DURATION_MIN)
  const [title, setTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]))
  const [repeatOn, setRepeatOn] = useState(false)
  const [repeatWeekdays, setRepeatWeekdays] = useState(/** @type {number[]} */ ([]))
  const [repeatWeeks, setRepeatWeeks] = useState(SCHEDULE_REPEAT_DEFAULT_WEEKS)

  useEffect(() => {
    if (!open) return
    const entry = draft
    const ids = normalizeScheduleClientIds(entry?.client_ids)
    const nextKind = entry?.id ? resolveScheduleEntryKind(entry) : SCHEDULE_KIND_TRAINING
    const nextFormMode = scheduleKindFormMode(nextKind)
    setKind(nextKind)
    setMode(nextFormMode !== 'either' ? nextFormMode : ids.length ? 'clients' : 'note')
    setTime(formatScheduleMinutes(Number(entry?.start_minutes ?? 10 * 60)))
    setDuration(Number(entry?.duration_minutes) || SCHEDULE_DEFAULT_DURATION_MIN)
    setTitle(String(entry?.title ?? ''))
    setSelectedIds(ids)
    setRepeatOn(false)
    const wd = scheduleWeekdayIndex(dayIso)
    setRepeatWeekdays(wd >= 0 ? [wd] : [])
    setRepeatWeeks(SCHEDULE_REPEAT_DEFAULT_WEEKS)
  }, [open, draft])

  const repeatPlan = useMemo(() => {
    if (!repeatOn) return { days: [], skipped: 0 }
    return planScheduleRepeatCopies(
      { startDayIso: dayIso, weekdays: repeatWeekdays, weeks: repeatWeeks, todayIso: todayInTimeZoneIso() },
      {
        start_minutes: parseScheduleTimeToMinutes(time) ?? -1,
        client_ids: mode === 'clients' ? selectedIds : [],
        title: mode === 'note' ? title : '',
      },
      entries,
    )
  }, [repeatOn, dayIso, repeatWeekdays, repeatWeeks, time, mode, selectedIds, title, entries])

  const formMode = scheduleKindFormMode(kind)

  const pickKind = (next) => {
    setKind(next)
    const nextMode = scheduleKindFormMode(next)
    if (nextMode !== 'either') setMode(nextMode)
  }

  const toggleClient = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const previewLabel = useMemo(() => {
    if (mode === 'note') return title.trim() || 'Заметка'
    return buildScheduleEntryLabel({ client_ids: selectedIds, title: '' }, clientNameById)
  }, [mode, title, selectedIds, clientNameById])

  /** @returns {{ ok: true, fields: object } | { ok: false, error: string }} */
  const readFields = () => {
    const startMinutes = parseScheduleTimeToMinutes(time)
    if (startMinutes == null) return { ok: false, error: 'Укажите время в формате ЧЧ:ММ' }
    const client_ids = mode === 'clients' ? selectedIds : []
    const note = mode === 'note' ? title.trim() : ''
    if (scheduleKindRequiresClients(kind) && !client_ids.length) return { ok: false, error: 'Для тренировки выберите клиента' }
    if (!client_ids.length && !note) return { ok: false, error: 'Напишите заметку или выберите клиента' }
    return {
      ok: true,
      fields: { day_date: dayIso, start_minutes: startMinutes, duration_minutes: duration, title: note, client_ids, kind },
    }
  }

  return {
    mode,
    setMode,
    kind,
    pickKind,
    formMode,
    time,
    setTime,
    duration,
    setDuration,
    title,
    setTitle,
    selectedIds,
    toggleClient,
    repeat: { on: repeatOn, setOn: setRepeatOn, weekdays: repeatWeekdays, setWeekdays: setRepeatWeekdays, weeks: repeatWeeks, setWeeks: setRepeatWeeks, plan: repeatPlan },
    previewLabel,
    readFields,
  }
}
