import { useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../../lib/localDataEvents.js'
import { screeningSummary } from '../../lib/health/healthScreeningCore.js'
import { loadHealthScreening } from '../../lib/health/healthScreeningService.js'
import { HealthScreeningBadges } from './HealthScreeningBadges.jsx'

/** Экран тренировки: итог анкеты здоровья под именем клиента (только чтение, из локальной базы). */
export function TrainingHealthBadges({ clientId }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!clientId) return undefined
    let alive = true
    const load = async () => {
      const row = await loadHealthScreening(clientId)
      if (alive) setSummary(row?.answers ? screeningSummary(row.answers) : null)
    }
    void load()
    window.addEventListener(LOCAL_DATA_CHANGED, load)
    return () => {
      alive = false
      window.removeEventListener(LOCAL_DATA_CHANGED, load)
    }
  }, [clientId])

  if (!summary?.badges.length && !summary?.pulseUnreliable) return null
  return (
    <div className="training-health">
      <HealthScreeningBadges badges={summary.badges} max={5} />
      {summary.pulseUnreliable ? <p className="hscr__hint">Пульс — не ориентир нагрузки: смотрите на самочувствие и дыхание.</p> : null}
    </div>
  )
}
