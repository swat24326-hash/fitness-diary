import { useEffect, useMemo, useState } from 'react'
import { Dumbbell, FileBarChart, Target, Wallet } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildGeminiPanelKpi } from '../lib/admin/geminiPanelKpi.js'

/**
 * @param {{
 *   bundle: object | null,
 *   year: number,
 *   month: number,
 *   loading?: boolean,
 * }} props
 */
export function GeminiContextKpi({ bundle, year, month, loading = false }) {
  const kpi = useMemo(() => buildGeminiPanelKpi(bundle, year, month), [bundle, year, month])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [year, month, kpi?.profitTotal, kpi?.planPct])

  if (loading && !kpi) {
    return (
      <div className="gemini-panel__kpi gemini-panel__kpi--loading" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (!kpi) return null

  return (
    <div className="gemini-panel__kpi" aria-label="Ключевые показатели месяца">
      <div className="gemini-panel__kpi-plan">
        <div className="gemini-panel__kpi-plan-head">
          <Target size={14} aria-hidden />
          <span>План</span>
          <strong>{kpi.hasPlan ? `${kpi.planPct}%` : '—'}</strong>
        </div>
        <div className="gemini-panel__kpi-track" aria-hidden>
          <div
            className={`gemini-panel__kpi-fill${mounted ? ' gemini-panel__kpi-fill--ready' : ''}`}
            style={{ width: mounted ? `${kpi.planFillPercent}%` : '0%' }}
          />
        </div>
      </div>

      <div className="gemini-panel__kpi-grid">
        <div className="gemini-panel__kpi-card">
          <Wallet size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">Продажи</span>
          <strong>{formatRub(kpi.profitTotal)}</strong>
        </div>
        <div className="gemini-panel__kpi-card">
          <Dumbbell size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">FIT-CITY</span>
          <strong>{kpi.fitCity}</strong>
        </div>
        <div className="gemini-panel__kpi-card">
          <FileBarChart size={15} aria-hidden />
          <span className="gemini-panel__kpi-label">Отчёты</span>
          <strong>{kpi.reportsLabel}</strong>
        </div>
      </div>
    </div>
  )
}
