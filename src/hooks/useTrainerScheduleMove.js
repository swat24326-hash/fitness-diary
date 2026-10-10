import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateRu } from '../lib/dateRu.js'
import { formatScheduleMinutes, weekdayShortRu } from '../lib/trainer/trainerScheduleCore.js'
import { moveTrainerScheduleEntry } from '../lib/trainer/trainerScheduleService.js'

const NOTICE_MS = 6000

/**
 * Перенос записи ежедневника + плашка «Перенесено · Отменить».
 * @param {{ onSaved: () => void }} opts
 */
export function useTrainerScheduleMove({ onSaved }) {
  const [notice, setNotice] = useState(
    /** @type {{ text: string, tone: 'info' | 'error', undoEntry?: object } | null} */ (null),
  )
  const timerRef = useRef(0)

  const show = useCallback((next) => {
    window.clearTimeout(timerRef.current)
    setNotice(next)
    timerRef.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const moveEntry = useCallback(
    async (entry, dayIso, startMinutes) => {
      const res = await moveTrainerScheduleEntry(entry, dayIso, startMinutes)
      if (!res.ok) {
        show({ text: res.error ?? 'Не удалось перенести запись', tone: 'error' })
        return
      }
      onSaved()
      const when = `${weekdayShortRu(dayIso)} ${formatDateRu(dayIso).slice(0, 5)}, ${formatScheduleMinutes(startMinutes)}`
      show({ text: `Перенесено на ${when}`, tone: 'info', undoEntry: entry })
    },
    [onSaved, show],
  )

  const undo = useCallback(async () => {
    const prev = notice?.undoEntry
    if (!prev) return
    setNotice(null)
    const res = await moveTrainerScheduleEntry(prev, prev.day_date, prev.start_minutes)
    if (!res.ok) {
      show({ text: res.error ?? 'Не удалось отменить перенос', tone: 'error' })
      return
    }
    onSaved()
  }, [notice, onSaved, show])

  const showLocked = useCallback(
    () => show({ text: 'Тренировка по записи завершена — запись не переносится', tone: 'error' }),
    [show],
  )

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setNotice(null)
  }, [])

  const notify = useCallback((text) => show({ text, tone: 'info' }), [show])

  return { notice, moveEntry, undo, showLocked, notify, dismiss }
}
