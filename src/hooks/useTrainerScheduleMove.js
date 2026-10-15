import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateRu } from '../lib/dateRu.js'
import { formatScheduleMinutes, weekdayShortRu } from '../lib/trainer/trainerScheduleCore.js'
import { scheduleMoveNotice } from '../lib/trainer/trainerScheduleDeliveryCore.js'
import { moveTrainerScheduleEntry } from '../lib/trainer/trainerScheduleService.js'

const NOTICE_MS = 6000
const WARN_NOTICE_MS = 12000

function moveWhen(dayIso, startMinutes) {
  return `${weekdayShortRu(dayIso)} ${formatDateRu(dayIso).slice(0, 5)}, ${formatScheduleMinutes(startMinutes)}`
}

/**
 * Перенос записи ежедневника + плашка «Перенесено · Отменить».
 * move — планшет пишет в IndexedDB, телефон через сервер; оба отвечают { ok, entry?, error? }.
 * confirmDelivery — только планшет: ждёт, пока очередь отправит перенос (иначе напоминание уйдёт по старому времени).
 * @param {{
 *   onSaved: () => void,
 *   move?: (entry: object, dayIso: string, startMinutes: number) => Promise<{ ok: boolean, entry?: object, error?: string }>,
 *   confirmDelivery?: (entryId: string) => Promise<import('../lib/trainer/trainerScheduleDeliveryCore.js').ScheduleDelivery>,
 * }} opts
 */
export function useTrainerScheduleMove({ onSaved, move = moveTrainerScheduleEntry, confirmDelivery }) {
  const [notice, setNotice] = useState(
    /** @type {{ text: string, tone: 'info' | 'warn' | 'error', undoEntry?: object, movedEntry?: object } | null} */ (null),
  )
  const timerRef = useRef(0)
  const seqRef = useRef(0)

  const show = useCallback((next) => {
    window.clearTimeout(timerRef.current)
    setNotice(next)
    timerRef.current = window.setTimeout(() => setNotice(null), next.tone === 'info' ? NOTICE_MS : WARN_NOTICE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  /** Итог переноса с учётом доставки на сервер; старые проверки не перетирают плашку нового переноса. */
  const announceMove = useCallback(
    async (when, extra, entryId) => {
      const seq = ++seqRef.current
      if (!confirmDelivery || !entryId) {
        show({ ...scheduleMoveNotice(when, 'sent'), ...extra })
        return
      }
      show({ ...scheduleMoveNotice(when, 'sending'), ...extra })
      const delivery = await confirmDelivery(entryId)
      if (seq !== seqRef.current) return
      if (delivery === 'sent') onSaved()
      show({ ...scheduleMoveNotice(when, delivery), ...extra })
    },
    [confirmDelivery, onSaved, show],
  )

  const moveEntry = useCallback(
    async (entry, dayIso, startMinutes) => {
      const res = await move(entry, dayIso, startMinutes)
      if (!res.ok) {
        show({ text: res.error ?? 'Не удалось перенести запись', tone: 'error' })
        return
      }
      onSaved()
      const moved = res.entry ?? entry
      await announceMove(moveWhen(dayIso, startMinutes), { undoEntry: entry, movedEntry: moved }, moved?.id)
    },
    [announceMove, move, onSaved, show],
  )

  const undo = useCallback(async () => {
    const prev = notice?.undoEntry
    if (!prev) return
    setNotice(null)
    const res = await move(notice.movedEntry ?? prev, prev.day_date, prev.start_minutes)
    if (!res.ok) {
      show({ text: res.error ?? 'Не удалось отменить перенос', tone: 'error' })
      return
    }
    onSaved()
    await announceMove(moveWhen(prev.day_date, prev.start_minutes), {}, prev.id)
  }, [announceMove, move, notice, onSaved, show])

  /** Перенос через форму записи (сменили день или время и сохранили). */
  const announceSavedMove = useCallback(
    (prev, saved) => {
      if (!prev?.id || !saved) return
      if (prev.day_date === saved.day_date && Number(prev.start_minutes) === Number(saved.start_minutes)) return
      void announceMove(moveWhen(saved.day_date, saved.start_minutes), {}, saved.id)
    },
    [announceMove],
  )

  const showLocked = useCallback(
    () => show({ text: 'Тренировка по записи завершена — запись не переносится', tone: 'error' }),
    [show],
  )

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setNotice(null)
  }, [])

  const notify = useCallback((text) => show({ text, tone: 'info' }), [show])

  return { notice, moveEntry, undo, announceSavedMove, showLocked, notify, dismiss }
}
