import { useEffect, useState } from 'react'
import { todayInTimeZoneIso } from '../lib/dateRu.js'
import { minutesOfDayInTimeZone } from '../lib/trainer/trainerScheduleNowCore.js'

const TICK_MS = 30_000

function readNow() {
  const now = new Date()
  return { todayIso: todayInTimeZoneIso(undefined, now), nowMinutes: minutesOfDayInTimeZone(now) }
}

/** Сегодня и минуты «сейчас» по МСК; обновляется, пока экран открыт. */
export function useTrainerScheduleNow() {
  const [state, setState] = useState(readNow)
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readNow()
      setState((prev) =>
        prev.todayIso === next.todayIso && prev.nowMinutes === next.nowMinutes ? prev : next,
      )
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return state
}
