import { useEffect, useMemo, useState } from 'react'
import { Dumbbell, Users, Wallet, AlertTriangle } from 'lucide-react'
import { buildTrainerPanelKpi } from '../../lib/admin/iskraTrainerPanelCore.js'

/**
 * @param {{
 *   contour?: object | null,
 *   trainerId?: string | null,
 *   loading?: boolean,
 * }} props
 */
export function IskraTrainerKpi({ contour, trainerId = null, loading = false }) {
  const kpi = useMemo(() => buildTrainerPanelKpi(contour, trainerId), [contour, trainerId])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [trainerId, kpi?.completedTrainings])

  if (loading && !kpi) {
    return (
      <div className="gemini-panel__kpi gemini-panel__kpi--loading" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (!kpi) return null

  const warnTone = kpi.inactiveHolders >= 5 || kpi.noTypeTrainings >= 3

  return (
    <div className="gemini-panel__kpi iskra-trainer-kpi" aria-label="Показатели планшетов">
      <p className="iskra-trainer-kpi__scope muted">{kpi.label}</p>
      <div className="iskra-trainer-kpi__grid">
        <div className="gemini-panel__kpi-card iskra-trainer-kpi__stat">
          <Dumbbell size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">Тренировки</span>
          <strong>{kpi.completedTrainings}</strong>
        </div>
        <div className="gemini-panel__kpi-card iskra-trainer-kpi__stat">
          <Wallet size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">ЗП планшета</span>
          <strong>{kpi.personalSalaryLabel}</strong>
        </div>
        <div className={`gemini-panel__kpi-card iskra-trainer-kpi__stat${warnTone ? ' iskra-trainer-kpi__stat--warn' : ''}`}>
          <Users size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">Неактивных</span>
          <strong>{kpi.inactiveHolders}</strong>
        </div>
        {kpi.scope === 'trainer' ? (
          <div className="gemini-panel__kpi-card iskra-trainer-kpi__stat">
            <Users size={15} aria-hidden />
            <span className="gemini-panel__kpi-label">С абонементом</span>
            <strong>{kpi.activeHolders}</strong>
          </div>
        ) : null}
      </div>

      {kpi.noTypeTrainings > 0 ? (
        <p className="iskra-trainer-kpi__note iskra-trainer-kpi__note--warn" role="note">
          <AlertTriangle size={13} aria-hidden />
          {kpi.noTypeTrainings} без типа карты
        </p>
      ) : null}

      <div
        className={`gemini-panel__kpi-track iskra-trainer-kpi__bar${mounted ? ' gemini-panel__kpi-fill--ready' : ''}`}
        aria-hidden
      >
        <div
          className={`gemini-panel__kpi-fill${mounted ? ' gemini-panel__kpi-fill--ready' : ''}`}
          style={{ width: mounted ? `${kpi.activityFillPercent}%` : '0%' }}
        />
      </div>
      <p className="iskra-trainer-kpi__isolated muted">{kpi.isolatedNote}</p>
    </div>
  )
}
