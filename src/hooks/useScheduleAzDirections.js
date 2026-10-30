import { useEffect, useState } from 'react'
import { listScheduleAzDirections } from '../lib/trainer/trainerScheduleAzDirections.js'

/** Направления АЗ клуба для формы «Групповое». */
export function useScheduleAzDirections(clubId) {
  const [azDirections, setAzDirections] = useState(/** @type {Array<{ id: string, name: string }>} */ ([]))
  useEffect(() => {
    let cancelled = false
    const cid = String(clubId ?? '').trim()
    if (!cid) {
      setAzDirections([])
      return undefined
    }
    void listScheduleAzDirections(cid).then((list) => {
      if (!cancelled) setAzDirections(list)
    })
    return () => {
      cancelled = true
    }
  }, [clubId])
  return azDirections
}
