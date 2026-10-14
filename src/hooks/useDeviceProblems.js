import { useEffect, useState } from 'react'
import { DEVICE_HEALTH_EVENT, getDeviceProblems } from '../lib/deviceHealth/deviceHealthReporter.js'

/** Проблемы этого планшета (deviceHealthReporter) — для иконки «Помощь» и подсказки в ней. */
export function useDeviceProblems() {
  const [problems, setProblems] = useState(getDeviceProblems)
  useEffect(() => {
    const onChange = () => setProblems(getDeviceProblems())
    window.addEventListener(DEVICE_HEALTH_EVENT, onChange)
    return () => window.removeEventListener(DEVICE_HEALTH_EVENT, onChange)
  }, [])
  return problems
}
