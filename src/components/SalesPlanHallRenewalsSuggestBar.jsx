import { useCallback, useEffect, useState } from 'react'
import { Calculator } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  applyHallRenewalsSuggestToPlanForm,
  clampPurchaseHistoryDepth,
  clampRenewalPct,
  formatHallRenewalsSummaryRu,
  HALL_RENEWALS_DEFAULT_HISTORY,
  HALL_RENEWALS_DEFAULT_PCT,
} from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'
import { loadHallRenewalsSuggestForClub } from '../lib/admin/salesPlanHallRenewalsSuggestService.js'
import {
  applyHallPlanTopUpToPlanForm,
  buildHallPlanTopUpPackage,
} from '../lib/admin/salesPlanHallTopUpCore.js'
import { loadStrategyArchiveDrift } from '../lib/admin/salesStrategyArchiveDriftService.js'
import { buildStrategySnapshot } from '../lib/admin/salesStrategySnapshotCore.js'
import { saveStrategySnapshotForClub } from '../lib/admin/salesStrategySnapshotService.js'
import {
  readStrategySnapshotSession,
  writeStrategySnapshotSession,
} from '../lib/admin/salesStrategySnapshotSession.js'
import { formatDateRu } from '../lib/dateRu.js'
import { SalesPlanHallRenewalsSuggestPreview } from './SalesPlanHallRenewalsSuggestPreview.jsx'
import { SalesStrategyPlaybookSection } from './SalesStrategyPlaybookSection.jsx'
import { SalesStrategyArchiveDriftBanner } from './SalesStrategyArchiveDriftBanner.jsx'

/**
 * Ориентир ДК + НК/УК по долям прошлого месяца + добор до плана.
 *
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   monthDays?: object[],
 *   prevMonthDays?: object[],
 *   prevMonthYear?: number,
 *   prevMonthMonth?: number,
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   fixedHorizon?: 'current' | 'next',
 *   disabled?: boolean,
 *   onToast?: (text: string, tone?: 'ok' | 'err' | 'warn') => void,
 *   applyHint?: string,
 *   initialStrategyHydration?: {
 *     ok?: boolean,
 *     renewalsSuggest?: object,
 *     topUpPack?: object|null,
 *     snapshot?: object,
 *   } | null,
 * }} props
 */
export function SalesPlanHallRenewalsSuggestBar({
  clubId,
  year,
  month,
  monthDays = [],
  prevMonthDays = [],
  prevMonthYear,
  prevMonthMonth,
  planForm,
  onPlanChange,
  fixedHorizon,
  disabled = false,
  onToast,
  applyHint = 'Сохраните направления во вкладке «План месяца».',
  initialStrategyHydration = null,
}) {
  const [busy, setBusy] = useState(false)
  const [renewalPct, setRenewalPct] = useState(String(HALL_RENEWALS_DEFAULT_PCT))
  const [historyDepth, setHistoryDepth] = useState(String(HALL_RENEWALS_DEFAULT_HISTORY))
  const [preview, setPreview] = useState(/** @type {object | null} */ (null))
  const [topUpPack, setTopUpPack] = useState(/** @type {object | null} */ (null))
  const [lastSummary, setLastSummary] = useState('')
  const [candidateSnapshot, setCandidateSnapshot] = useState(/** @type {object[] | null} */ (null))
  const [archiveDrift, setArchiveDrift] = useState(/** @type {object | null} */ (null))
  const [snapshotMeta, setSnapshotMeta] = useState(/** @type {{ updatedAt?: string } | null} */ (null))

  const locked = fixedHorizon === 'current' || fixedHorizon === 'next'
  const calcHorizon = locked ? fixedHorizon : 'current'

  useEffect(() => {
    /** Облако важнее; иначе sessionStorage — чтобы вкладка не «забывала» расчёт. */
    let h = initialStrategyHydration?.ok ? initialStrategyHydration : null
    if (!h?.ok && clubId && year && month) {
      const local = readStrategySnapshotSession(clubId, year, month)
      if (local.ok) h = local
    }
    if (!h?.ok || !h.renewalsSuggest?.ok) return
    const suggest = h.renewalsSuggest
    setPreview(suggest)
    setRenewalPct(String(clampRenewalPct(suggest.renewalPct)))
    if (suggest.historyDepth) setHistoryDepth(String(clampPurchaseHistoryDepth(suggest.historyDepth)))
    setCandidateSnapshot(Array.isArray(suggest.candidates) ? suggest.candidates : [])
    setLastSummary(formatHallRenewalsSummaryRu(suggest))
    setTopUpPack(h.topUpPack?.ok ? h.topUpPack : null)
    setSnapshotMeta({ updatedAt: h.snapshot?.updatedAt || suggest.snapshotUpdatedAt || '' })
    if (h.snapshot) writeStrategySnapshotSession(clubId, year, month, h.snapshot)
  }, [initialStrategyHydration, clubId, year, month])

  const refreshArchiveDrift = useCallback(
    async (candidates) => {
      if (!clubId) {
        setArchiveDrift(null)
        return
      }
      try {
        const res = await loadStrategyArchiveDrift({
          clubId,
          previousCandidates: candidates ?? [],
          renewalPct,
          year,
          month,
        })
        setArchiveDrift(res?.ok ? res : null)
      } catch {
        setArchiveDrift(null)
      }
    },
    [clubId, renewalPct, year, month],
  )

  useEffect(() => {
    if (!clubId) {
      setArchiveDrift(null)
      return undefined
    }
    const tick = () => {
      void refreshArchiveDrift(candidateSnapshot ?? [])
    }
    tick()
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(timer)
    }
  }, [clubId, refreshArchiveDrift, candidateSnapshot])

  const runCalculate = async (horizon) => {
    if (!clubId || busy || disabled) return
    setBusy(true)
    setPreview(null)
    setTopUpPack(null)
    try {
      const res = await loadHallRenewalsSuggestForClub({
        clubId,
        year,
        month,
        horizon,
        renewalPct,
        historyDepth,
        monthDays,
      })
      if (!res.ok || !res.suggest?.ok) {
        const msg = res.error || res.suggest?.error || 'Не удалось посчитать ориентир'
        onToast?.(msg, 'warn')
        setLastSummary('')
        return
      }
      setPreview(res.suggest)
      setLastSummary(formatHallRenewalsSummaryRu(res.suggest))
      setCandidateSnapshot(Array.isArray(res.suggest.candidates) ? res.suggest.candidates : [])

      const pack = buildHallPlanTopUpPackage({
        renewalsSuggest: res.suggest,
        prevMonthRows: prevMonthDays,
        prevMonthYear,
        prevMonthMonth,
        planForm,
      })
      /** @type {object|null} */
      let packForSnap = null
      if (pack.ok) {
        setTopUpPack(pack)
        packForSnap = pack
        if (!pack.prevSalesDays) {
          onToast?.(
            'Нет продаж за прошлый месяц (по дате отчёта) — доли НК/УК приблизительные',
            'warn',
          )
        } else if (pack.fittedToBudget === false) {
          onToast?.(
            pack.targets?.fitted === false
              ? 'ДК продлений больше ур. 3 — пакет не уместился в бюджет'
              : (Number(pack.budgetDelta) || 0) < 0
                ? 'Пакет ниже ур. 3 после округления'
                : 'Пакет выше ур. 3 больше допуска +15 000 ₽',
            'warn',
          )
        }
      } else {
        setTopUpPack(null)
      }

      if (res.truncated) {
        onToast?.('Список абонементов обрезан лимитом API — ориентир может быть неполным', 'warn')
      }

      const built = buildStrategySnapshot({
        year,
        month,
        renewalsSuggest: res.suggest,
        topUpPack: packForSnap,
      })
      if (built.ok) {
        writeStrategySnapshotSession(clubId, year, month, built.snapshot)
        setSnapshotMeta({ updatedAt: built.snapshot.updatedAt || new Date().toISOString() })
      }

      const saved = await saveStrategySnapshotForClub({
        clubId,
        year,
        month,
        renewalsSuggest: res.suggest,
        topUpPack: packForSnap,
      })
      if (saved.ok) {
        setSnapshotMeta({ updatedAt: saved.snapshot?.updatedAt || new Date().toISOString() })
        if (saved.snapshot) writeStrategySnapshotSession(clubId, year, month, saved.snapshot)
      } else if (saved.error) {
        onToast?.(`Расчёт готов, на других устройствах — после миграции снимка: ${saved.error}`, 'warn')
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
    if (topUpPack?.ok) {
      const next = applyHallPlanTopUpToPlanForm(planForm, topUpPack, {
        syncDirections: true,
        syncLevel3: false,
      })
      onPlanChange(next)
      void saveStrategySnapshotForClub({
        clubId,
        year,
        month,
        renewalsSuggest: preview,
        topUpPack,
      }).then((saved) => {
        if (saved.ok) {
          setSnapshotMeta({ updatedAt: saved.snapshot?.updatedAt || new Date().toISOString() })
        }
      })
      const extra = Number(topUpPack.planExtraRub) || 0
      const total = Number(topUpPack.totalWithExtra) || Number(topUpPack.totalAmount) || 0
      const l3 = Number(topUpPack.level3Budget) || 0
      onToast?.(
        `План: залы ${formatRub(topUpPack.totalAmount)}${
          extra > 0 ? ` + доп. ${formatRub(extra)}` : ''
        } = ${formatRub(total)}${l3 > 0 ? ` · ур. 3 ${formatRub(l3)}` : ''}. ${applyHint}`,
        'ok',
      )
      return
    }
    const next = applyHallRenewalsSuggestToPlanForm(planForm, preview)
    onPlanChange(next)
    onToast?.(
      `В план только ДК: ${preview.count} шт. · ${formatRub(preview.amount)}. ${applyHint}`,
      'ok',
    )
  }

  return (
    <div className="sales-plan-pz-dk-suggest" role="group" aria-label="Ориентир продлений и добора плана">
      <p className="sales-plan-pz-dk-suggest__lead muted">
        <strong>1.</strong> Кто кончается в месяце → ДК (история покупок или прайс) × % продления.
        Архив не входит. <strong>2.</strong> Доп. 70%; добор НК/УК по доле ₽ зала за прошлый месяц.
        <strong>3.</strong> «В план клуба» → «План месяца».
        {snapshotMeta?.updatedAt ? (
          <>
            {' '}
            Снимок с {formatDateRu(String(snapshotMeta.updatedAt).slice(0, 10))}
            {String(snapshotMeta.updatedAt).length > 10
              ? ` ${String(snapshotMeta.updatedAt).slice(11, 16)}`
              : ''}
            {' · '}
            обновить — «Посчитать» (виден на всех устройствах).
          </>
        ) : null}
      </p>

      <div className="sales-plan-pz-dk-suggest__toolbar">
        <label className="sales-plan-pz-dk-suggest__pct">
          % продления
          <input
            type="number"
            className="sales-plan-pz-dk-suggest__pct-input"
            min={1}
            max={100}
            value={renewalPct}
            disabled={busy || disabled}
            onChange={(e) => setRenewalPct(e.target.value)}
            onBlur={() => setRenewalPct(String(clampRenewalPct(renewalPct)))}
          />
        </label>
        <label className="sales-plan-pz-dk-suggest__pct">
          Ср. из покупок
          <input
            type="number"
            className="sales-plan-pz-dk-suggest__pct-input"
            min={1}
            max={12}
            value={historyDepth}
            disabled={busy || disabled}
            onChange={(e) => setHistoryDepth(e.target.value)}
            onBlur={() => setHistoryDepth(String(clampPurchaseHistoryDepth(historyDepth)))}
            title="Сколько последних покупок усреднять (1–12)"
          />
        </label>
        {locked ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy || disabled || !clubId}
            onClick={() => void runCalculate(fixedHorizon)}
          >
            <Calculator size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {busy ? 'Считаем…' : 'Посчитать'}
          </button>
        ) : (
          <div className="sales-plan-pz-dk-suggest__row">
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              disabled={busy || disabled || !clubId}
              onClick={() => void runCalculate('current')}
            >
              Текущий месяц
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              disabled={busy || disabled || !clubId}
              onClick={() => void runCalculate('next')}
            >
              Следующий
            </button>
          </div>
        )}
      </div>

      {lastSummary && !preview?.ok ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          {lastSummary}
        </p>
      ) : null}

      {preview?.ok ? (
        <SalesPlanHallRenewalsSuggestPreview
          suggest={preview}
          topUpPack={topUpPack}
          disabled={disabled}
          onApply={applyPreview}
        />
      ) : null}

      <SalesStrategyArchiveDriftBanner
        drift={archiveDrift}
        busy={busy}
        disabled={disabled}
        onRecalculate={() => void runCalculate(calcHorizon)}
      />

      {preview?.ok && topUpPack?.ok ? (
        <SalesStrategyPlaybookSection
          year={year}
          month={month}
          clubId={clubId}
          renewalsSuggest={preview}
          topUpPack={topUpPack}
          monthDays={monthDays}
        />
      ) : null}
    </div>
  )
}
