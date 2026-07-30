import { useEffect, useState } from 'react'
import { Calculator, Check } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { todayLocalIso } from '../lib/dateRu.js'
import {
  applyPzDkSuggestToPlanForm,
  clampRenewalPct,
  formatPzDkSuggestSummaryRu,
  planMonthMatchesTarget,
  PZ_DK_DEFAULT_RENEWAL_PCT,
  PZ_DK_SUGGEST_SESSIONS,
  resolveTargetPlanMonthForHorizon,
} from '../lib/admin/salesPlanPzDkSuggestCore.js'
import { loadPzDkPlanSuggestForClub } from '../lib/admin/salesPlanPzDkSuggestService.js'

/**
 * Ориентир ПЗ ДК: текущий / следующий месяц, % продления, минус факт, превью → применить.
 *
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   membershipTypes: object[],
 *   monthDays?: object[],
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   onSelectPlanMonth?: (ym: { year: number, month: number }) => void,
 *   disabled?: boolean,
 *   onToast?: (text: string, tone?: 'ok' | 'err' | 'warn') => void,
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
  onSelectPlanMonth,
  disabled = false,
  onToast,
}) {
  const [busyHorizon, setBusyHorizon] = useState(/** @type {null | 'current' | 'next'} */ (null))
  const [pendingHorizon, setPendingHorizon] = useState(/** @type {null | 'current' | 'next'} */ (null))
  const [renewalPct, setRenewalPct] = useState(String(PZ_DK_DEFAULT_RENEWAL_PCT))
  const [preview, setPreview] = useState(/** @type {object | null} */ (null))
  const [lastSummary, setLastSummary] = useState('')

  const runCalculate = async (horizon) => {
    if (!clubId || busyHorizon || disabled) return
    setBusyHorizon(horizon)
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
      setBusyHorizon(null)
    }
  }

  const startHorizon = (horizon) => {
    if (!clubId || busyHorizon || disabled) return
    const target = resolveTargetPlanMonthForHorizon(horizon, todayLocalIso())
    if (!target) {
      onToast?.('Не удалось определить месяц', 'err')
      return
    }
    if (!planMonthMatchesTarget(year, month, target)) {
      if (typeof onSelectPlanMonth !== 'function') {
        onToast?.(
          `Откройте план на ${target.month}.${target.year} и нажмите снова`,
          'warn',
        )
        return
      }
      setPendingHorizon(horizon)
      onSelectPlanMonth({ year: target.year, month: target.month })
      onToast?.(
        horizon === 'current'
          ? 'Переключили на текущий месяц плана — считаем…'
          : 'Переключили на следующий месяц плана — считаем…',
        'ok',
      )
      return
    }
    void runCalculate(horizon)
  }

  useEffect(() => {
    if (!pendingHorizon || busyHorizon) return
    const target = resolveTargetPlanMonthForHorizon(pendingHorizon, todayLocalIso())
    if (!target || !planMonthMatchesTarget(year, month, target)) return
    const h = pendingHorizon
    setPendingHorizon(null)
    void runCalculate(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только после смены месяца плана
  }, [year, month, pendingHorizon, monthDays])

  const applyPreview = () => {
    if (!preview?.ok) return
    const next = applyPzDkSuggestToPlanForm(planForm, preview)
    onPlanChange(next)
    onToast?.(
      `ПЗ ДК в форме: ${preview.count} шт. → ${formatRub(preview.amount)}. Сохраните направления.`,
      'ok',
    )
  }

  const busy = busyHorizon != null || pendingHorizon != null

  return (
    <div className="sales-plan-pz-dk-suggest" role="group" aria-label="Ориентир плана ПЗ ДК">
      <p className="sales-plan-pz-dk-suggest__lead muted">
        План продлений ПЗ·ДК: прайс пакета <strong>{PZ_DK_SUGGEST_SESSIONS} тр.</strong> × действующие
        по типам карт × <strong>% продления</strong>. Кнопка сама открывает нужный месяц плана.
        Для текущего — вычитаем уже учтённые в отчётах шт. ПЗ ДК. Сначала превью, потом «В план».
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

      <ul className="sales-plan-pz-dk-suggest__hints muted">
        <li>
          <strong>Текущий месяц</strong> — срез сегодня, минус факт ПЗ ДК в отчётах → остаток до конца месяца.
        </li>
        <li>
          <strong>Следующий месяц</strong> — срез накануне того месяца → черновик продлений (без вычета факта).
        </li>
      </ul>

      <div className="sales-plan-pz-dk-suggest__row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => startHorizon('current')}
          disabled={disabled || busy || !clubId}
        >
          <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {busyHorizon === 'current' || pendingHorizon === 'current'
            ? 'Считаем…'
            : 'Считать · текущий месяц'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => startHorizon('next')}
          disabled={disabled || busy || !clubId}
        >
          <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {busyHorizon === 'next' || pendingHorizon === 'next'
            ? 'Считаем…'
            : 'Считать · следующий месяц'}
        </button>
      </div>

      {preview?.ok ? (
        <div className="sales-plan-pz-dk-suggest__preview" role="status">
          <p className="sales-plan-pz-dk-suggest__preview-title">Превью ПЗ · ДК</p>
          <p className="sales-plan-pz-dk-suggest__summary">{formatPzDkSuggestSummaryRu(preview)}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={applyPreview}
            disabled={disabled}
          >
            <Check size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            В план ({preview.count} шт. · {formatRub(preview.amount)})
          </button>
        </div>
      ) : lastSummary ? (
        <p className="sales-plan-pz-dk-suggest__summary muted" role="status">
          {lastSummary}
        </p>
      ) : null}
    </div>
  )
}
