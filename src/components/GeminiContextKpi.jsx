import { useEffect, useMemo, useState } from 'react'
import { Dumbbell, FileBarChart, Wallet } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { formatPctPlain, phrasePlanBenchmark } from '../lib/admin/iskraReplyPhrasing.js'
import { buildGeminiPanelKpi, buildGeminiPanelKpiFromSnapshot } from '../lib/admin/geminiPanelKpi.js'
import { buildMonthRiverDays } from '../lib/admin/iskraSparkBriefCore.js'
import { IskraPlanArc } from './iskra/IskraPlanArc.jsx'
import { IskraMonthRiver } from './iskra/IskraMonthRiver.jsx'

/**
 * @param {{
 *   kpi?: object | null,
 *   analytics?: object | null,
 *   bundle?: object | null,
 *   year: number,
 *   month: number,
 *   loading?: boolean,
 * }} props
 */
export function GeminiContextKpi({ kpi: kpiProp, analytics, bundle, year, month, loading = false }) {
  const kpi = useMemo(() => {
    if (kpiProp) return kpiProp
    if (analytics) return buildGeminiPanelKpiFromSnapshot(analytics)
    if (bundle) return buildGeminiPanelKpi(bundle, year, month)
    return null
  }, [kpiProp, analytics, bundle, year, month])

  const river = useMemo(() => (kpi ? buildMonthRiverDays(kpi) : null), [kpi])
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

  const planTone = kpi.plan_tone ?? (kpi.planPct >= 85 ? 'ok' : kpi.planPct >= 45 ? 'neutral' : 'warn')
  const expected = Number(kpi.expectedPlanPct ?? kpi.expected_plan_pct)
  const hasExpected = Number.isFinite(expected) && expected > 0
  const planCaption = kpi.hasPlan
    ? hasExpected
      ? `Выполнено ${formatPctPlain(kpi.planPct)}% · ${phrasePlanBenchmark(expected)}`
      : `Выполнено ${formatPctPlain(kpi.planPct)}%`
    : null

  return (
    <div className="gemini-panel__kpi iskra-kpi-hero" aria-label="Ключевые показатели месяца">
      <div className="iskra-kpi-hero__top">
        <IskraPlanArc planPct={kpi.planPct} hasPlan={kpi.hasPlan} tone={planTone} size={96} />
        <div className="iskra-kpi-hero__stats">
          <div className="gemini-panel__kpi-card iskra-kpi-hero__stat">
            <Wallet size={15} aria-hidden />
            <span className="gemini-panel__kpi-label">Прибыль</span>
            <strong>{formatRub(kpi.profitTotal)}</strong>
          </div>
          <div className="gemini-panel__kpi-card iskra-kpi-hero__stat">
            <Dumbbell size={15} aria-hidden />
            <span className="gemini-panel__kpi-label">Трен. ПЗ</span>
            <strong title="Тренировки персонального зала из отчётов менеджера за месяц">{kpi.pzTrainings}</strong>
          </div>
          <div className="gemini-panel__kpi-card iskra-kpi-hero__stat">
            <FileBarChart size={15} aria-hidden />
            <span className="gemini-panel__kpi-label">Дни отчёта</span>
            <strong>{kpi.reportsLabel}</strong>
          </div>
        </div>
      </div>

      {planCaption ? <p className="iskra-kpi-hero__caption muted">{planCaption}</p> : null}

      <div
        className={`gemini-panel__kpi-track iskra-kpi-hero__bar${mounted ? ' gemini-panel__kpi-fill--ready' : ''}`}
        aria-hidden
      >
        <div
          className={`gemini-panel__kpi-fill${mounted ? ' gemini-panel__kpi-fill--ready' : ''}`}
          style={{ width: mounted ? `${kpi.planFillPercent}%` : '0%' }}
        />
      </div>

      <IskraMonthRiver river={river} />
    </div>
  )
}
