import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  applyPzDkSuggestToPlanForm,
  clampRenewalPct,
  formatPzDkSuggestSummaryRu,
  PZ_DK_DEFAULT_RENEWAL_PCT,
  PZ_DK_SUGGEST_SESSIONS,
} from '../lib/admin/salesPlanPzDkSuggestCore.js'
import { loadPzDkPlanSuggestForClub } from '../lib/admin/salesPlanPzDkSuggestService.js'
import { SalesPlanPzDkSuggestPreview } from './SalesPlanPzDkSuggestPreview.jsx'

/**
 * Ориентир ПЗ ДК: % продления, минус факт (для current), превью → «В план».
 * `fixedHorizon` — горизонт задаёт родитель (вкладка «Стратегия»).
 *
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   membershipTypes: object[],
 *   monthDays?: object[],
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   fixedHorizon?: 'current' | 'next',
 *   disabled?: boolean,
 *   onToast?: (text: string, tone?: 'ok' | 'err' | 'warn') => void,
 *   applyHint?: string,
 * }} props
 */
export function SalesPlanPzDkSuggestBar({
  clubId,
  year,
  month,
  membershipTypes,
  monthDays = [],
  planForm,
  onPlanChange,
  fixedHorizon,
  disabled = false,
  onToast,
  applyHint = 'Сохраните направления во вкладке «План месяца».',
}) {
  const [busy, setBusy] = useState(false)
  const [renewalPct, setRenewalPct] = useState(String(PZ_DK_DEFAULT_RENEWAL_PCT))
  const [preview, setPreview] = useState(/** @type {object | null} */ (null))
  const [lastSummary, setLastSummary] = useState('')

  const locked = fixedHorizon === 'current' || fixedHorizon === 'next'

  const runCalculate = async (horizon) => {
    if (!clubId || busy || disabled) return
    setBusy(true)
    setPreview(null)
    try {
      const res = await loadPzDkPlanSuggestForClub({
        clubId,
        year,
        month,
        membershipTypes,
        horizon,
        renewalPct,
        monthDays,
      })
      if (!res.ok || !res.suggest?.ok) {
        const msg = res.error || res.suggest?.error || 'Не удалось посчитать ориентир'
        onToast?.(msg, 'warn')
        setLastSummary('')
        return
      }
      setPreview(res.suggest)
      setLastSummary(formatPzDkSuggestSummaryRu(res.suggest))
      if (res.truncated) {
        onToast?.('Список абонементов обрезан лимитом API — ориентир может быть неполным', 'warn')
      }
    } catch (e) {
      onToast?.(e?.message || 'Ошибка расчёта ориентира', 'err')
      setLastSummary('')
    } finally {
      setBusy(false)
    }
  }

  const applyPreview = () => {
    if (!preview?.ok) return
    const next = applyPzDkSuggestToPlanForm(planForm, preview)
    onPlanChange(next)
    onToast?.(`ПЗ ДК в форме: ${preview.count} шт. → ${formatRub(preview.amount)}. ${applyHint}`, 'ok')
  }

  return (
    <div className="sales-plan-pz-dk-suggest" role="group" aria-label="Ориентир плана ПЗ ДК">
      <p className="sales-plan-pz-dk-suggest__lead muted">
        Прайс пакета <strong>{PZ_DK_SUGGEST_SESSIONS} тр.</strong> × действующие по типам ×{' '}
        <strong>% продления</strong>
        {locked && fixedHorizon === 'current'
          ? '. Для текущего месяца вычитаем уже учтённые в отчётах шт. ПЗ ДК.'
          : locked
            ? '. Срез накануне месяца плана (без вычета факта).'
            : '.'}
      </p>

      <div className="sales-plan-pz-dk-suggest__controls">
        <label className="sales-plan-pz-dk-suggest__pct" htmlFor="pz-dk-renewal-pct">
          % продления
          <input
            id="pz-dk-renewal-pct"
            type="text"
            inputMode="numeric"
            className="sales-finance-block__input sales-plan-pz-dk-suggest__pct-input"
            value={renewalPct}
            onChange={(e) => setRenewalPct(e.target.value)}
            onBlur={() => setRenewalPct(String(clampRenewalPct(renewalPct)))}
            disabled={disabled || busy}
            aria-describedby="pz-dk-renewal-hint"
          />
        </label>
        <span id="pz-dk-renewal-hint" className="muted sales-plan-pz-dk-suggest__pct-hint">
          по умолчанию {PZ_DK_DEFAULT_RENEWAL_PCT}% — не все ДК купят снова
        </span>
      </div>

      <div className="sales-plan-pz-dk-suggest__row">
        {locked ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void runCalculate(fixedHorizon)}
            disabled={disabled || busy || !clubId}
          >
            <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {busy ? 'Считаем…' : 'Считать ПЗ · ДК'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runCalculate('current')}
              disabled={disabled || busy || !clubId}
            >
              <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              {busy ? 'Считаем…' : 'Считать · текущий месяц'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runCalculate('next')}
              disabled={disabled || busy || !clubId}
            >
              <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Считать · следующий месяц
            </button>
          </>
        )}
      </div>

      {preview?.ok ? (
        <SalesPlanPzDkSuggestPreview suggest={preview} disabled={disabled} onApply={applyPreview} />
      ) : lastSummary ? (
        <p className="sales-plan-pz-dk-suggest__summary muted" role="status">
          {lastSummary}
        </p>
      ) : null}
    </div>
  )
}
