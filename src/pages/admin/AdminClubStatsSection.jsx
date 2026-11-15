import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BarChart3, ClipboardList, Gauge, LayoutGrid, LineChart, TrendingDown, TrendingUp, Trophy, UserPlus } from 'lucide-react'
import { listTrainerSummariesForAdmin, loadClubTrainingStats } from '../../lib/dataAccess'
import { isSupabaseConfigured } from '../../lib/supabase'
import { loadTrainerMonthlyStatsForYear } from '../../lib/trainer/trainerMonthlyStatsService'
import { loadTrainerPeriodStats } from '../../lib/trainer/trainerPeriodStatsService'
import { getDateRange, PERIOD_PRESETS } from '../../lib/period'
import { previousCalendarMonthRangeFromIso } from '../../lib/admin/dayChartPrevMonthCore.js'
import { AdminClubDayChart } from '../../components/AdminClubDayChart'
import { AdminClubMonthlyChart } from '../../components/AdminClubMonthlyChart'
import { MembershipTypeStatsTable } from '../../components/MembershipTypeStatsTable'
import { CoachQualityPanel } from '../../components/CoachQualityPanel'
import { ClientRetentionPanel } from '../../components/ClientRetentionPanel'
import { ClientAttendanceClubPanel } from '../../components/ClientAttendanceClubPanel'
import { formatRetentionRatePct } from '../../lib/admin/clientRetentionPresentationCore.js'
import {
  formatClubAttendancePct,
  formatClubAvgVisitsPerWeek,
} from '../../lib/admin/clubAttendanceAggCore.js'
import { TrainerRatingCard } from '../../components/admin/TrainerRatingCard'
import { loadClubMonthlyStatsForYear, MONTHS_PER_CALENDAR_YEAR } from '../../lib/admin/adminClubMonthlyService'
import { loadTrainerPayrollContextClient } from '../../lib/admin/trainerPayrollContextClient.js'
import { enrichPaySnapshotMembershipTypesForAerobic } from '../../lib/admin/trainerPayMonthSnapshotCore.js'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { useIskraPanel } from '../../context/IskraPanelContext.jsx'
import { useClubPeriodStatsLoad } from './useClubPeriodStatsLoad'
import { AdminClubStatsPeriodBar } from '../../components/admin/AdminClubStatsPeriodBar.jsx'
import {
  CLUB_STATS_HALL_LABELS,
  clubStatsHallShowsPzOnlyCards,
} from '../../lib/admin/clubStatsHallFilterCore.js'
import { adminClubStatsHelpLines } from '../../lib/admin/adminClubStatsHelpCore.js'
import { AdminClubStatsHelpTip } from '../../components/admin/AdminClubStatsHelpTip.jsx'

/** @typedef {'byDay' | 'byTypes' | 'rating' | 'clubMonthly' | 'pnk' | 'coachQuality' | 'clientRetention' | 'clientAttendance' | 'completed'} AdminStatsInlinePanel */

/** @typedef {'journal' | 'coachQuality'} AdminStatsDeepLinkPanel */

/**
 * @param {{
 *   clubId: string,
 *   trainerScope?: { trainerId: string, clubId?: string | null, selfLabel?: string },
 *   initialPeriod?: string | null,
 *   deepLinkPanel?: AdminStatsDeepLinkPanel | null,
 *   onDeepLinkConsumed?: () => void,
 *   onActiveRangeChange?: (r: { start: string, end: string } | null) => void,
 *   onOpenCompletedJournal?: () => void,
 *   completedJournalOpen?: boolean,
 *   completedJournal?: import('react').ReactNode,
 *   onCompletedJournalOpenChange?: (open: boolean) => void,
 *   onStatsContextReset?: () => void,
 *   hideSectionTitle?: boolean,
 *   completedJournalId?: string,
 * }} props
 */
export function AdminClubStatsSection({
  clubId,
  trainerScope,
  initialPeriod = null,
  deepLinkPanel = null,
  onDeepLinkConsumed,
  onActiveRangeChange,
  onOpenCompletedJournal,
  completedJournalOpen = false,
  completedJournal = null,
  onCompletedJournalOpenChange,
  onStatsContextReset,
  hideSectionTitle = false,
  completedJournalId = 'admin-completed-trainings-journal',
}) {
  const isTrainerScope = Boolean(trainerScope?.trainerId)
  const { pathname } = useLocation()
  const scopeTrainerId = trainerScope?.trainerId ?? ''
  const scopeClubId = trainerScope?.clubId ?? clubId ?? ''
  const { openIskra } = useIskraPanel()
  const periodPresetIds = useMemo(() => new Set(PERIOD_PRESETS.map((p) => p.id)), [])
  const resolvedInitialPeriod =
    initialPeriod && periodPresetIds.has(initialPeriod) ? initialPeriod : 'month'
  const [period, setPeriod] = useState(resolvedInitialPeriod)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  /** @type {['pz'|'tz'|'az', Function]} */
  const [statsHall, setStatsHall] = useState(/** @type {'pz'|'tz'|'az'} */ ('pz'))
  const [trainerNameById, setTrainerNameById] = useState({})
  /** @type {[AdminStatsInlinePanel, Function]} */
  const [inlinePanel, setInlinePanel] = useState(/** @type {AdminStatsInlinePanel} */ ('completed'))
  const [clubMonthly, setClubMonthly] = useState([])
  const [clubMonthlyBusy, setClubMonthlyBusy] = useState(false)
  const [monthlyChartYear, setMonthlyChartYear] = useState(() => new Date().getFullYear())
  const [monthlyYears, setMonthlyYears] = useState(() => [new Date().getFullYear()])
  const [monthlyYearSummary, setMonthlyYearSummary] = useState(null)
  const [payrollCtx, setPayrollCtx] = useState(() => ({
    planConfig: null,
    profilesByTrainerId: null,
    membershipTypes: null,
  }))
  const monthlyCacheRef = useRef(new Map())
  const deepLinkHandledRef = useRef('')

  useEffect(() => {
    if (initialPeriod && periodPresetIds.has(initialPeriod)) {
      setPeriod(initialPeriod)
    }
  }, [initialPeriod, clubId, periodPresetIds])

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])

  const { busy, coachQualityBusy, clientRetentionBusy, clientAttendanceBusy, stats, pnkFunnel } = useClubPeriodStatsLoad({
    clubId,
    isTrainerScope,
    scopeTrainerId,
    scopeClubId,
    range,
    hall: isTrainerScope ? null : statsHall,
  })

  const [prevByDay, setPrevByDay] = useState(/** @type {Array<{ date: string, completed?: number, draft?: number }>} */ ([]))

  useEffect(() => {
    if (inlinePanel !== 'byDay') return
    const canLoad = isTrainerScope ? scopeTrainerId : clubId
    const prev = previousCalendarMonthRangeFromIso(range.start)
    if (!canLoad || !prev) {
      setPrevByDay([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const s = isTrainerScope
          ? await loadTrainerPeriodStats({
              trainerId: scopeTrainerId,
              clubId: scopeClubId || null,
              dateFrom: prev.dateFrom,
              dateTo: prev.dateTo,
              includeCoachQuality: false,
            })
          : await loadClubTrainingStats({
              clubId,
              dateFrom: prev.dateFrom,
              dateTo: prev.dateTo,
              includeCoachQuality: false,
              hall: statsHall || 'pz',
            })
        if (!cancelled) setPrevByDay(Array.isArray(s?.byDay) ? s.byDay : [])
      } catch {
        if (!cancelled) setPrevByDay([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    inlinePanel,
    clubId,
    isTrainerScope,
    scopeTrainerId,
    scopeClubId,
    range.start,
    statsHall,
  ])

  const showPzOnlyCards = isTrainerScope || clubStatsHallShowsPzOnlyCards(statsHall)

  useEffect(() => {
    if (showPzOnlyCards) return
    setInlinePanel((prev) =>
      prev === 'pnk' ||
      prev === 'byDay' ||
      prev === 'rating' ||
      prev === 'coachQuality' ||
      prev === 'clientRetention' ||
      prev === 'clientAttendance' ||
      prev === 'clubMonthly' ||
      prev === 'completed'
        ? 'byTypes'
        : prev || 'byTypes',
    )
    onCompletedJournalOpenChange?.(false)
  }, [showPzOnlyCards, statsHall, onCompletedJournalOpenChange])

  useEffect(() => {
    if (completedJournalOpen) setInlinePanel('completed')
  }, [completedJournalOpen])

  useEffect(() => {
    if (!showPzOnlyCards || inlinePanel !== 'completed' || completedJournalOpen) return
    onCompletedJournalOpenChange?.(true)
    onOpenCompletedJournal?.()
  }, [
    showPzOnlyCards,
    inlinePanel,
    completedJournalOpen,
    onCompletedJournalOpenChange,
    onOpenCompletedJournal,
  ])

  const onStatsHallChange = (hall) => {
    setStatsHall(hall)
    if (clubStatsHallShowsPzOnlyCards(hall)) {
      setInlinePanel('completed')
      onCompletedJournalOpenChange?.(true)
      onOpenCompletedJournal?.()
    } else {
      setInlinePanel('byTypes')
      onCompletedJournalOpenChange?.(false)
    }
    onStatsContextReset?.()
  }

  useEffect(() => {
    const cid = String(scopeClubId || clubId || '').trim()
    if (!cid || !isSupabaseConfigured() || isTrainerScope) {
      setPayrollCtx({ planConfig: null, profilesByTrainerId: null, membershipTypes: null })
      return
    }
    let cancelled = false
    const end = String(range.end ?? '').slice(0, 10)
    const year = Number(end.slice(0, 4)) || new Date().getFullYear()
    const month = Number(end.slice(5, 7)) || new Date().getMonth() + 1
    void Promise.all([
      loadTrainerPayrollContextClient(cid, { year, month }),
      listMembershipTypesForClub(cid).catch(() => []),
    ]).then(([ctx, types]) => {
      if (cancelled) return
      setPayrollCtx({
        planConfig: ctx?.planConfig ?? null,
        profilesByTrainerId: ctx?.profilesByTrainerId ?? null,
        membershipTypes:
          ctx?.frozen && Array.isArray(ctx.membershipTypes) && ctx.membershipTypes.length
            ? enrichPaySnapshotMembershipTypesForAerobic(ctx.membershipTypes, types)
            : types,
      })
    })
    return () => {
      cancelled = true
    }
  }, [clubId, scopeClubId, isTrainerScope, range.end])

  const defaultChartYear = useMemo(() => {
    const end = String(range.end ?? '').slice(0, 10)
    const y = Number(end.slice(0, 4))
    return Number.isFinite(y) && y >= 2000 ? y : new Date().getFullYear()
  }, [range.end])

  useEffect(() => {
    if (!range.start || !range.end || range.start > range.end) {
      onActiveRangeChange?.(null)
      return
    }
    onActiveRangeChange?.({ start: range.start, end: range.end })
  }, [range.start, range.end, onActiveRangeChange])

  const reloadNames = useCallback(async () => {
    try {
      const list = await listTrainerSummariesForAdmin()
      const m = {}
      for (const u of list) {
        m[u.id] = u.name?.trim() || '—'
      }
      setTrainerNameById(m)
    } catch {
      setTrainerNameById({})
    }
  }, [])

  useEffect(() => {
    if (isTrainerScope || !clubId) {
      setTrainerNameById({})
      return
    }
    void reloadNames()
  }, [clubId, isTrainerScope, reloadNames])

  useEffect(() => {
    // Сброс кэша итога при смене клуба/скоупа. Панель не в null —
    // иначе при повторном входе в статистику все отчёты «закрыты».
    setClubMonthly([])
    setClubMonthlyBusy(false)
    setMonthlyChartYear(defaultChartYear)
    setMonthlyYears([defaultChartYear])
    setMonthlyYearSummary(null)
    monthlyCacheRef.current.clear()
    deepLinkHandledRef.current = ''
    if (!isTrainerScope) setStatsHall('pz')
    setInlinePanel('completed')
    onCompletedJournalOpenChange?.(true)
    onOpenCompletedJournal?.()
  }, [
    clubId,
    scopeClubId,
    isTrainerScope,
    defaultChartYear,
    onCompletedJournalOpenChange,
    onOpenCompletedJournal,
  ])

  /** Итог по календарному году — только при открытии графика. */
  useEffect(() => {
    if (inlinePanel !== 'clubMonthly') return
    if (!isTrainerScope && !clubId) return
    if (isTrainerScope && !scopeTrainerId) return

    const cacheKey = `${isTrainerScope ? scopeTrainerId : clubId}:${monthlyChartYear}`
    const cached = monthlyCacheRef.current.get(cacheKey)
    if (cached) {
      setClubMonthly(cached.months)
      setMonthlyYears(cached.years)
      setMonthlyYearSummary(cached.yearSummary ?? null)
      setClubMonthlyBusy(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setClubMonthly([])
      setClubMonthlyBusy(true)
      try {
        const res = isTrainerScope
          ? await loadTrainerMonthlyStatsForYear({
              trainerId: scopeTrainerId,
              clubId: scopeClubId,
              year: monthlyChartYear,
            })
          : await loadClubMonthlyStatsForYear({
              clubId,
              year: monthlyChartYear,
            })
        if (cancelled) return
        const months = Array.isArray(res?.months) ? res.months : []
        const years = Array.isArray(res?.years)?.length ? res.years : [monthlyChartYear]
        const yearSummary = res?.yearSummary ?? null
        monthlyCacheRef.current.set(cacheKey, { months, years, yearSummary })
        setClubMonthly(months)
        setMonthlyYears(years)
        setMonthlyYearSummary(yearSummary)
      } catch {
        if (!cancelled) {
          setClubMonthly([])
          setMonthlyYearSummary(null)
        }
      } finally {
        if (!cancelled) setClubMonthlyBusy(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [inlinePanel, monthlyChartYear, clubId, scopeClubId, scopeTrainerId, isTrainerScope])

  useEffect(() => {
    if (!deepLinkPanel || busy || !stats) return
    if (deepLinkPanel === 'coachQuality' && coachQualityBusy) return
    // ПНК/журнал/качество — только ПЗ: сначала переключаем вкладку, не сжигаем deep-link.
    if (
      !isTrainerScope &&
      statsHall !== 'pz' &&
      (deepLinkPanel === 'journal' || deepLinkPanel === 'coachQuality')
    ) {
      setStatsHall('pz')
      return
    }
    const key = `${clubId}:${deepLinkPanel}:${range.start}:${range.end}:${isTrainerScope ? 't' : statsHall}`
    if (deepLinkHandledRef.current === key) return
    deepLinkHandledRef.current = key
    // «Не активные» — в Клиентах (админ и тренер), не карточка статистики.
    if (deepLinkPanel === 'journal') {
      setInlinePanel('completed')
      onOpenCompletedJournal?.()
      onCompletedJournalOpenChange?.(true)
    } else if (deepLinkPanel === 'coachQuality') {
      setInlinePanel('coachQuality')
      onCompletedJournalOpenChange?.(false)
      window.setTimeout(() => {
        document.getElementById('admin-coach-quality-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
    onDeepLinkConsumed?.()
  }, [
    deepLinkPanel,
    busy,
    coachQualityBusy,
    stats,
    clubId,
    range.start,
    range.end,
    statsHall,
    isTrainerScope,
    onOpenCompletedJournal,
    onCompletedJournalOpenChange,
    onDeepLinkConsumed,
  ])

  const dayActivityTotal = useMemo(() => {
    const byDay = stats?.byDay ?? []
    return byDay.reduce((sum, d) => sum + (d.completed ?? 0) + (d.draft ?? 0), 0)
  }, [stats?.byDay])

  const trainerLabel = (id) => {
    if (!id) return '—'
    if (isTrainerScope && id === scopeTrainerId) {
      return trainerScope?.selfLabel?.trim() || 'Вы'
    }
    return trainerNameById[id] ?? (String(id).length > 10 ? `Tренер ${String(id).slice(0, 8)}…` : id)
  }

  const clubMonthlySum = useMemo(() => clubMonthly.reduce((sum, r) => sum + (Number(r?.count) || 0), 0), [clubMonthly])

  const coachQualityByTrainer = useMemo(() => {
    const map = new Map()
    for (const row of stats?.coachQuality?.trainers ?? []) {
      map.set(String(row.trainerId), row)
    }
    return map
  }, [stats?.coachQuality?.trainers])

  const coachQualityAvg = stats?.coachQuality?.averageScorePct ?? null
  const selfCoachQuality = isTrainerScope
    ? coachQualityByTrainer.get(String(scopeTrainerId)) ?? null
    : null
  const coachQualityCardValue = isTrainerScope
    ? selfCoachQuality?.scorePct ?? null
    : coachQualityAvg
  const hasCoachQualityRows = (stats?.coachQuality?.trainers ?? []).length > 0

  const clientRetention = stats?.clientRetention ?? null
  const clientRetentionM3 = clientRetention?.retentionM3?.averageRate ?? null
  const hasClientRetention =
    clientRetention != null &&
    ((clientRetention.poolSize ?? 0) > 0 || (clientRetention.universeSize ?? 0) > 0)

  const clientAttendance = stats?.clientAttendance ?? null
  const hasClientAttendance = clientAttendance != null && (clientAttendance.poolSize ?? 0) > 0

  const attendanceByTrainer = useMemo(() => {
    const map = new Map()
    for (const row of clientAttendance?.byTrainer ?? []) {
      if (row?.trainerId == null) continue
      map.set(String(row.trainerId), row)
    }
    return map
  }, [clientAttendance?.byTrainer])

  const retentionByTrainer = useMemo(() => {
    const map = new Map()
    for (const row of Object.values(clientRetention?.byTrainer ?? {})) {
      if (!row?.trainerId) continue
      map.set(String(row.trainerId), row)
    }
    return map
  }, [clientRetention?.byTrainer])
  const clientHrefForQuality = useCallback(
    (clientId) => {
      const id = String(clientId ?? '').trim()
      if (!id) return '/'
      return isTrainerScope
        ? `/trainer/clients/${id}`
        : pathname.startsWith('/club')
          ? `/club/clients/${id}`
          : `/admin/clients/${id}`
    },
    [isTrainerScope, pathname],
  )

  if (!isTrainerScope && !clubId) {
    return (
      <section className="card admin-club-stats-shell">
        <h2 className="section-title td-section-title" style={{ margin: '0 0 8px' }}>
          Статистика клуба
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Выберите <strong>клуб</strong> в панели админки (параметр в адресной строке или переключатель), чтобы увидеть сводку по залу: тренировки по дням, нагрузка по тренерам и рейтинги за период.
        </p>
      </section>
    )
  }

  const s = stats
  const totalCompleted = s?.totalCompleted ?? 0
  const byDay = s?.byDay ?? []
  const byTrainer = s?.byTrainer ?? []
  const byType = s?.byType ?? []
  const byTrainerByType = s?.byTrainerByType ?? []
  const totalCounted = s?.totalCounted ?? 0
  const helpCtx = {
    isTrainerScope,
    showPzOnlyCards,
    hallLabel: CLUB_STATS_HALL_LABELS[statsHall] || '',
  }
  const detailHelp = (key, label) => (
    <AdminClubStatsHelpTip label={label} lines={adminClubStatsHelpLines(key, helpCtx)} />
  )

  /** Карточки только переключают панель — повторный клик не сворачивает. */
  const selectInlinePanel = (panel) => {
    setInlinePanel((cur) => {
      if (cur === panel) return cur
      if (panel === 'clubMonthly') setMonthlyChartYear(defaultChartYear)
      return panel
    })
    if (panel === 'completed') {
      onCompletedJournalOpenChange?.(true)
      onOpenCompletedJournal?.()
      return
    }
    onCompletedJournalOpenChange?.(false)
  }

  const selectCompletedJournal = () => {
    selectInlinePanel('completed')
  }

  const statCardClass = (active) =>
    ['card', 'stat-card', 'admin-club-stat-card', 'admin-club-stat-card--clickable', active ? 'admin-club-stat-card--active' : '']
      .filter(Boolean)
      .join(' ')

  return (
    <section className="card admin-club-stats-shell">
      <AdminClubStatsPeriodBar
        showHall={!isTrainerScope}
        hall={statsHall}
        onHallChange={onStatsHallChange}
        period={period}
        onPeriodChange={setPeriod}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
      />
      {hideSectionTitle ? (
        <span className="u-visually-hidden">Сводка за период</span>
      ) : (
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            {isTrainerScope ? 'Статистика' : 'Статистика клуба'}
          </h2>
        </div>
      )}
      {s?.fallbackReason ? <p className="muted admin-inline-note">Резерв / причина: {s.fallbackReason}</p> : null}
      <div className="admin-club-stats-board">
        <div className="admin-club-stats-board__grid">
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'completed')}
            aria-expanded={inlinePanel === 'completed'}
            aria-controls={completedJournalId}
            aria-label={
              totalCompleted > 0
                ? `Проведено тренировок: ${totalCompleted}. Список за период`
                : 'Проведено тренировок: нет за период'
            }
            title="Проведено тренировок — список за период"
            onClick={selectCompletedJournal}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Проведено</h3>
              <ClipboardList className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{totalCompleted}</p>
          </button>
          ) : null}

          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'pnk')}
            aria-expanded={inlinePanel === 'pnk'}
            aria-label={
              pnkFunnel
                ? `ПНК в ДК: ${pnkFunnel.won} из ${pnkFunnel.entered}, ${pnkFunnel.conversionPct} процентов. Подробнее`
                : 'ПНК в ДК: нет данных'
            }
            title="ПНК → ДК — воронка за период"
            onClick={() => selectInlinePanel('pnk')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">ПНК</h3>
              <UserPlus className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value admin-club-stat-card__value--pnk">
              {pnkFunnel ? (
                <>
                  <span className="admin-club-stat-card__fraction">
                    {pnkFunnel.won}/{pnkFunnel.entered}
                  </span>
                  <span className="admin-club-stat-card__pct">{pnkFunnel.conversionPct}%</span>
                </>
              ) : (
                '—'
              )}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'byDay')}
            disabled={dayActivityTotal === 0}
            aria-expanded={inlinePanel === 'byDay'}
            aria-label={
              dayActivityTotal > 0
                ? `По дням: ${dayActivityTotal} записей. Подробнее`
                : 'По дням: нет данных за период'
            }
            title="По дням — график"
            onClick={() => selectInlinePanel('byDay')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">По дням</h3>
              <BarChart3 className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{dayActivityTotal}</p>
          </button>
          ) : null}
          <button
            type="button"
            className={statCardClass(inlinePanel === 'byTypes')}
            disabled={totalCounted === 0}
            aria-expanded={inlinePanel === 'byTypes'}
            aria-label={
              totalCounted > 0
                ? showPzOnlyCards
                  ? `По типам карт: ${totalCounted} записей. Подробнее`
                  : `По типам карт ${CLUB_STATS_HALL_LABELS[statsHall] || ''}: ${totalCounted} абонов. Подробнее`
                : 'По типам карт: нет данных'
            }
            title="По типам карт — таблица"
            onClick={() => selectInlinePanel('byTypes')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Типы карт</h3>
              <LayoutGrid className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{totalCounted}</p>
          </button>
          {showPzOnlyCards && !isTrainerScope ? (
            <button
              type="button"
              className={statCardClass(inlinePanel === 'rating')}
              disabled={!byTrainer.length}
              aria-expanded={inlinePanel === 'rating'}
              aria-label={byTrainer.length ? `Рейтинг тренеров: ${byTrainer.length}. Подробнее` : 'Рейтинг тренеров: нет данных'}
              title="Рейтинг тренеров"
              onClick={() => selectInlinePanel('rating')}
            >
              <div className="stat-card__top admin-club-stat-card__head">
                <h3 className="td-stat-title admin-club-stat-card__title">Рейтинг</h3>
                <Trophy className="stat-card__icon" size={22} aria-hidden />
              </div>
              <p className="stat-card__value admin-club-stat-card__value">{byTrainer.length}</p>
            </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'coachQuality')}
            disabled={!hasCoachQualityRows || coachQualityBusy}
            aria-busy={coachQualityBusy || undefined}
            aria-expanded={inlinePanel === 'coachQuality'}
            aria-label={
              coachQualityBusy
                ? 'Качество ведения: считаем'
                : hasCoachQualityRows
                  ? isTrainerScope
                    ? `Качество ведения: ${coachQualityCardValue != null ? `${coachQualityCardValue} из 100` : 'нет балла'}. Подробнее`
                    : `Качество ведения: средний балл ${coachQualityCardValue != null ? coachQualityCardValue : 'нет'}. Подробнее`
                  : 'Качество ведения: нет данных'
            }
            title="Качество ведения"
            onClick={() => selectInlinePanel('coachQuality')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Качество</h3>
              <Gauge className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">
              {coachQualityBusy ? (
                '…'
              ) : coachQualityCardValue != null ? (
                <>
                  {coachQualityCardValue}
                  <span className="admin-club-stat-card__value-unit">/100</span>
                </>
              ) : (
                '—'
              )}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'clientRetention')}
            disabled={!hasClientRetention || clientRetentionBusy}
            aria-busy={clientRetentionBusy || undefined}
            aria-expanded={inlinePanel === 'clientRetention'}
            aria-label={
              clientRetentionBusy
                ? 'Удержание: считаем'
                : hasClientRetention
                  ? `Удержание M+3: ${formatRetentionRatePct(clientRetentionM3)}. Подробнее`
                  : 'Удержание: нет данных'
            }
            title="Удержание M+3"
            onClick={() => selectInlinePanel('clientRetention')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">M+3</h3>
              <TrendingUp className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">
              {clientRetentionBusy ? '…' : formatRetentionRatePct(clientRetentionM3)}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            id="admin-client-attendance-card"
            className={statCardClass(inlinePanel === 'clientAttendance')}
            disabled={clientAttendanceBusy}
            aria-busy={clientAttendanceBusy || undefined}
            aria-expanded={inlinePanel === 'clientAttendance'}
            aria-controls="admin-client-attendance-panel"
            aria-label={
              clientAttendanceBusy
                ? 'Посещаемость: считаем'
                : hasClientAttendance
                  ? `Посещаемость: средняя ${formatClubAvgVisitsPerWeek(clientAttendance.avgVisitsPerWeek)} тренировок в неделю, без выпадения ${formatClubAttendancePct(clientAttendance.inRhythmPct)}. Подробнее`
                  : 'Посещаемость: нет активных абонов'
            }
            title="Посещаемость · трен./нед за 30 дней"
            onClick={() => selectInlinePanel('clientAttendance')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Ритм</h3>
              <TrendingDown className="stat-card__icon" size={20} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">
              {clientAttendanceBusy ? '…' : formatClubAvgVisitsPerWeek(clientAttendance?.avgVisitsPerWeek)}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'clubMonthly')}
            disabled={!range.end}
            aria-expanded={inlinePanel === 'clubMonthly'}
            aria-label={
              range.end
                ? `Итог: ${MONTHS_PER_CALENDAR_YEAR} месяцев, ${defaultChartYear} год. Подробнее`
                : 'Итоговая статистика недоступна'
            }
            title={isTrainerScope ? `Итог · год ${defaultChartYear}` : `Итог по клубу · год ${defaultChartYear}`}
            onClick={() => selectInlinePanel('clubMonthly')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Итог</h3>
              <LineChart className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{MONTHS_PER_CALENDAR_YEAR}</p>
          </button>
          ) : null}
        </div>
      </div>

      {inlinePanel === 'completed' && completedJournalOpen && completedJournal ? (
        <section className="card admin-club-stats-detail has-float-help" id={completedJournalId}>
          <div className="admin-club-stats-detail__head admin-club-stats-detail__head--float">
            {detailHelp('completed', 'Что за журнал тренировок')}
          </div>
          {completedJournal}
        </section>
      ) : null}

      {inlinePanel === 'pnk' && pnkFunnel && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail">
          <div className="admin-club-stats-detail__head">
            <h3 className="section-title">Воронка ПНК за период</h3>
            {detailHelp('pnk', 'Что значит воронка ПНК')}
          </div>
          <div className="admin-pnk-report__grid">
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">ПНК</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.entered}</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">Оформлено</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.won}</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">Отказы</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.lost}</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">Сейчас в работе</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.open}</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">Конверсия</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.conversionPct}%</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">С питанием</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.nutritionPct}%</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">С ДЗ</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.homeworkPct}%</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">Пакет полный</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.packageDone}</strong>
            </div>
            <div className="admin-pnk-report__cell">
              <span className="admin-pnk-report__label">С пробной</span>
              <strong className="admin-pnk-report__num">{pnkFunnel.trialDone}</strong>
            </div>
          </div>
          {!isTrainerScope && pnkFunnel.trainers?.length ? (
            <>
              <h4 className="section-title" style={{ fontSize: '0.95rem', margin: '16px 0 8px' }}>
                По тренерам
              </h4>
              <table className="admin-pnk-report__table">
                <thead>
                  <tr>
                    <th>Тренер</th>
                    <th>Оформл. / ПНК</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {pnkFunnel.trainers.map((t) => (
                    <tr key={t.trainerId}>
                      <td>{trainerLabel(t.trainerId)}</td>
                      <td>
                        {t.won}/{t.entered}
                      </td>
                      <td>{t.conversionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      ) : null}

      {inlinePanel === 'byDay' && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail">
          <div className="admin-club-stats-detail__head">
            <h3 className="section-title">Тренировки по дням</h3>
            {detailHelp('byDay', 'Что показывает график тренировок по дням')}
          </div>
          <AdminClubDayChart byDay={byDay} prevByDay={prevByDay} />
        </section>
      ) : null}

      {inlinePanel === 'byTypes' ? (
        <section className="card admin-club-stats-detail">
          <div className="admin-club-stats-detail__head">
            <h3 className="section-title">
              {showPzOnlyCards
                ? 'По типам абонементов'
                : `По типам абонементов · ${CLUB_STATS_HALL_LABELS[statsHall] || ''}`}
            </h3>
            {detailHelp('byTypes', 'Что значит таблица по типам карт')}
          </div>
          <MembershipTypeStatsTable
            byType={byType}
            byTrainerByType={byTrainerByType}
            trainerLabel={trainerLabel}
            showPayrollForecast={
              !isTrainerScope && showPzOnlyCards && Boolean(payrollCtx.membershipTypes?.length)
            }
            membershipTypes={payrollCtx.membershipTypes ?? []}
            planConfig={payrollCtx.planConfig}
            profilesByTrainerId={payrollCtx.profilesByTrainerId}
            clubId={scopeClubId || clubId}
            dateFrom={range.start}
            dateTo={range.end}
          />
        </section>
      ) : null}

      {inlinePanel === 'clubMonthly' && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail">
          <div className="admin-club-stats-detail__head">
            <h3 className="section-title">
              {isTrainerScope
                ? `Итоговая статистика · ${monthlyChartYear}`
                : `Итоговая статистика по клубу · ${monthlyChartYear}`}
            </h3>
            {detailHelp('clubMonthly', 'Что показывает итог по месяцам')}
          </div>
          {clubMonthlyBusy && !clubMonthly.length ? (
            <div className="admin-path-loading" role="status" aria-busy="true">
              <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
              <p className="admin-path-loading__text">Загрузка…</p>
            </div>
          ) : (
            <>
              {!clubMonthlySum &&
              (monthlyYearSummary?.completedInYear ?? 0) > 0 &&
              (monthlyYearSummary?.typedInYear ?? 0) === 0 ? (
                <p className="muted admin-inline-note" style={{ margin: '0 0 10px', lineHeight: 1.45 }}>
                  За {monthlyChartYear} год завершено <strong>{monthlyYearSummary.completedInYear}</strong> тренировок, но со <strong>типом карты</strong>{' '}
                  на абонементе — 0 (как «Без типа» в таблице). Назначьте тип в абонементе клиента или обновите данные (Sync).
                </p>
              ) : null}
              <AdminClubMonthlyChart
                rows={clubMonthly}
                year={monthlyChartYear}
                yearPicker={
                  monthlyYears.length ? (
                    <div className="admin-monthly-year-tabs" role="group" aria-label="Год графика">
                      {monthlyYears.map((y) => (
                        <button
                          key={y}
                          type="button"
                          className={`admin-monthly-year-tabs__btn${monthlyChartYear === y ? ' admin-monthly-year-tabs__btn--active' : ''}`}
                          aria-pressed={monthlyChartYear === y}
                          disabled={clubMonthlyBusy && monthlyChartYear === y}
                          onClick={() => {
                            if (y !== monthlyChartYear) setMonthlyChartYear(y)
                          }}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  ) : null
                }
              />
            </>
          )}
        </section>
      ) : null}

      {inlinePanel === 'rating' && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail">
          <div className="admin-club-stats-detail__head">
            <h3 className="section-title">Тренеры — рейтинг</h3>
            {detailHelp('rating', 'Что значит рейтинг тренеров')}
          </div>
          {byTrainer.length === 0 ? (
            <div className="os-empty-card" role="status">
              <p className="os-empty-card__title">Нет данных по тренерам</p>
              <p className="os-empty-card__hint">За выбранный период нет завершённых тренировок по тренерам клуба.</p>
            </div>
          ) : (
            <div className="trainer-rating-grid os-enter">
              {byTrainer.map((tr, idx) => {
                const tid = String(tr.trainerId)
                const q = coachQualityByTrainer.get(tid)
                const att = attendanceByTrainer.get(tid)
                const ret = retentionByTrainer.get(tid)
                const name = trainerLabel(tr.trainerId)
                return (
                  <TrainerRatingCard
                    key={tr.trainerId}
                    rank={idx + 1}
                    name={name}
                    completed={tr.completed}
                    draft={tr.draft}
                    clients={tr.uniqueClients}
                    attendanceAvg={att?.avgVisitsPerWeek ?? null}
                    retentionRow={ret ?? null}
                    quality={q ?? null}
                    onOpenIskra={
                      isTrainerScope
                        ? null
                        : () =>
                            openIskra({
                              trainerId: tr.trainerId,
                              trainerName: name,
                              clubId: scopeClubId,
                              initialMessage: `Искра, сводка по тренеру ${name} за этот месяц.`,
                            })
                    }
                  />
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {inlinePanel === 'coachQuality' && showPzOnlyCards ? (
        <div id="admin-coach-quality-panel" className="admin-club-stats-detail-slot">
          <CoachQualityPanel
            coachQuality={s?.coachQuality}
            trainerLabel={trainerLabel}
            clientHref={clientHrefForQuality}
            selfTrainerId={isTrainerScope ? scopeTrainerId : null}
            compact={isTrainerScope}
          />
        </div>
      ) : null}

      {inlinePanel === 'clientRetention' && showPzOnlyCards ? (
        <div id="admin-client-retention-panel" className="admin-club-stats-detail-slot">
          <ClientRetentionPanel
            clientRetention={s?.clientRetention}
            trainerLabel={trainerLabel}
            selfTrainerId={isTrainerScope ? scopeTrainerId : null}
            compact={isTrainerScope}
          />
        </div>
      ) : null}

      {inlinePanel === 'clientAttendance' && showPzOnlyCards ? (
        <div id="admin-client-attendance-panel" className="admin-club-stats-detail-slot">
          <ClientAttendanceClubPanel
            clientAttendance={clientAttendance}
            busy={clientAttendanceBusy}
            trainerLabel={trainerLabel}
            selfTrainerId={isTrainerScope ? scopeTrainerId : null}
          />
        </div>
      ) : null}

    </section>
  )
}
