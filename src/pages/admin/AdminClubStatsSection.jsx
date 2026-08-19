import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BarChart3, ClipboardList, Gauge, Info, LayoutGrid, LineChart, RefreshCw, TrendingUp, Trophy, UserPlus } from 'lucide-react'
import { listTrainerSummariesForAdmin, listClubsLocal } from '../../lib/dataAccess'
import { isSupabaseConfigured } from '../../lib/supabase'
import { loadTrainerMonthlyStatsForYear } from '../../lib/trainer/trainerMonthlyStatsService'
import { formatIsoRu, getDateRange, PERIOD_PRESETS } from '../../lib/period'
import { AdminClubDayChart } from '../../components/AdminClubDayChart'
import { AdminClubMonthlyChart } from '../../components/AdminClubMonthlyChart'
import { MembershipTypeStatsTable } from '../../components/MembershipTypeStatsTable'
import { CoachQualityPanel } from '../../components/CoachQualityPanel'
import { ClientRetentionPanel } from '../../components/ClientRetentionPanel'
import { formatRetentionRatePct } from '../../lib/admin/clientRetentionPresentationCore.js'
import { TrainerRatingCard } from '../../components/admin/TrainerRatingCard'
import { loadClubMonthlyStatsForYear, MONTHS_PER_CALENDAR_YEAR } from '../../lib/admin/adminClubMonthlyService'
import { loadTrainerPayrollContextClient } from '../../lib/admin/trainerPayrollContextClient.js'
import { listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { useIskraPanel } from '../../context/IskraPanelContext.jsx'
import { useClubPeriodStatsLoad } from './useClubPeriodStatsLoad'
import { AdminClubStatsHallTabs } from '../../components/admin/AdminClubStatsHallTabs.jsx'
import {
  CLUB_STATS_HALL_LABELS,
  clubStatsHallShowsPzOnlyCards,
} from '../../lib/admin/clubStatsHallFilterCore.js'

/** @typedef {'byDay' | 'byTypes' | 'rating' | 'clubMonthly' | 'pnk' | 'coachQuality' | 'clientRetention'} AdminStatsInlinePanel */

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
 *   onStatsContextReset?: () => void,
 *   hideSectionTitle?: boolean,
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
  onStatsContextReset,
  hideSectionTitle = false,
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
  const [clubLabel, setClubLabel] = useState('')
  const [statsHelpOpen, setStatsHelpOpen] = useState(false)
  /** @type {[AdminStatsInlinePanel | null, Function]} */
  const [inlinePanel, setInlinePanel] = useState(null)
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
  const statsHelpRef = useRef(null)
  const deepLinkHandledRef = useRef('')

  useEffect(() => {
    if (initialPeriod && periodPresetIds.has(initialPeriod)) {
      setPeriod(initialPeriod)
    }
  }, [initialPeriod, clubId, periodPresetIds])

  useEffect(() => {
    if (isTrainerScope) return
    setStatsHall('pz')
    setInlinePanel(null)
  }, [clubId, isTrainerScope])

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])

  const { busy, coachQualityBusy, clientRetentionBusy, stats, pnkFunnel, loadStats } = useClubPeriodStatsLoad({
    clubId,
    isTrainerScope,
    scopeTrainerId,
    scopeClubId,
    range,
    hall: isTrainerScope ? null : statsHall,
  })

  const showPzOnlyCards = isTrainerScope || clubStatsHallShowsPzOnlyCards(statsHall)

  useEffect(() => {
    if (showPzOnlyCards) return
    setInlinePanel((prev) =>
      prev === 'pnk' || prev === 'byDay' || prev === 'rating' || prev === 'coachQuality' || prev === 'clientRetention' || prev === 'clubMonthly'
        ? null
        : prev,
    )
  }, [showPzOnlyCards, statsHall])

  const onStatsHallChange = (hall) => {
    setStatsHall(hall)
    setInlinePanel(null)
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
            ? ctx.membershipTypes
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
    setStatsHelpOpen(false)
    setInlinePanel(null)
    setClubMonthly([])
    setClubMonthlyBusy(false)
    setMonthlyChartYear(defaultChartYear)
    setMonthlyYears([defaultChartYear])
    setMonthlyYearSummary(null)
    monthlyCacheRef.current.clear()
    deepLinkHandledRef.current = ''
  }, [clubId, scopeClubId, isTrainerScope, defaultChartYear])

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
    if (!statsHelpOpen) return
    const onDoc = (e) => {
      if (statsHelpRef.current && !statsHelpRef.current.contains(e.target)) setStatsHelpOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setStatsHelpOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [statsHelpOpen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isTrainerScope || !clubId) {
        setClubLabel('')
        return
      }
      try {
        const clubs = await listClubsLocal()
        if (cancelled) return
        const c = clubs.find((x) => x.id === clubId)
        setClubLabel(c?.name?.trim() || '')
      } catch {
        if (!cancelled) setClubLabel('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, isTrainerScope])

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
    setInlinePanel(null)
    // «Не активные» — в Клиентах (админ и тренер), не карточка статистики.
    if (deepLinkPanel === 'journal') {
      onOpenCompletedJournal?.()
    } else if (deepLinkPanel === 'coachQuality') {
      setInlinePanel('coachQuality')
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
    onDeepLinkConsumed,
  ])

  const maxDayTotal = useMemo(() => {
    if (!stats?.byDay?.length) return 1
    let m = 1
    for (const d of stats.byDay) {
      const t = (d.completed ?? 0) + (d.draft ?? 0)
      if (t > m) m = t
    }
    return m
  }, [stats?.byDay])

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
      <section className="card">
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
  const totalDraft = s?.totalDraft ?? 0
  const uniqueClients = s?.uniqueClients ?? 0
  const byDay = s?.byDay ?? []
  const byTrainer = s?.byTrainer ?? []
  const byType = s?.byType ?? []
  const byTrainerByType = s?.byTrainerByType ?? []
  const totalCounted = s?.totalCounted ?? 0

  const toggleInlinePanel = (panel) => {
    setInlinePanel((cur) => {
      const next = cur === panel ? null : panel
      if (next === 'clubMonthly') setMonthlyChartYear(defaultChartYear)
      return next
    })
  }

  const statCardClass = (active) =>
    ['card', 'stat-card', 'admin-club-stat-card', 'admin-club-stat-card--clickable', active ? 'admin-club-stat-card--active' : '']
      .filter(Boolean)
      .join(' ')

  return (
    <section className="card">
      <div className="td-section-head">
        {hideSectionTitle ? (
          <span className="u-visually-hidden">Сводка за период</span>
        ) : (
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            {isTrainerScope ? 'Статистика' : 'Статистика клуба'}
          </h2>
        )}
        <div className="row td-actions">
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => {
              if (!isTrainerScope) void reloadNames()
              void loadStats()
            }}
            aria-label="Обновить статистику"
            title="Обновить"
          >
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
        </div>
      </div>
      {!isTrainerScope ? (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          {clubLabel ? (
            <>
              Клуб: <strong>{clubLabel}</strong>
              {s?.source === 'remote' || s?.source === 'admin_api' || s?.source === 'api' ? (
                <> · данные из <strong>облака</strong>.</>
              ) : (
                <>
                  · сейчас с <strong>устройства</strong> (IndexedDB).
                  {!isSupabaseConfigured()
                    ? ' Добавьте Supabase в .env для облака.'
                    : ' Если сервер недоступен, проверьте сеть и RLS.'}
                </>
              )}
            </>
          ) : (
            <>Сводка по клубу: клиенты и абонементы на конец периода, непродления в диапазоне, проведённые тренировки, график по дням и рейтинг тренеров.</>
          )}
        </p>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          {s?.source === 'api'
            ? 'Цифры с сервера клуба.'
            : s?.source === 'last_good'
              ? 'Показаны последние успешные цифры (сеть сбойнула).'
              : 'Сейчас с устройства. Если нули — нажмите Sync или обновите приложение.'}
        </p>
      )}
      {!isTrainerScope ? (
        <div style={{ margin: '0 0 12px' }}>
          <AdminClubStatsHallTabs value={statsHall} onChange={onStatsHallChange} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0', lineHeight: 1.4 }}>
            Цифры по залу. Человек с абонами в разных залах может быть на нескольких вкладках — не складывайте ПЗ+ТЗ+АЗ.
          </p>
        </div>
      ) : null}
      {s?.fallbackReason ? <p className="muted admin-inline-note">Резерв / причина: {s.fallbackReason}</p> : null}

      <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
        Период
      </h3>
      <div className="row td-period__buttons" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {PERIOD_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`btn ${period === p.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="grid grid-2 td-period__custom" style={{ marginBottom: 10 }}>
          <div className="field td-period__field" style={{ marginBottom: 0 }}>
            <label className="label">С</label>
            <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required />
          </div>
          <div className="field td-period__field" style={{ marginBottom: 0 }}>
            <label className="label">По</label>
            <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} required />
          </div>
        </div>
      )}
      <p className="muted td-range" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {range.start && range.end ? (
          <>
            Диапазон: {formatIsoRu(range.start)} — {formatIsoRu(range.end)}
          </>
        ) : period === 'custom' ? (
          <span className="admin-inline-note">Укажите даты «с» и «по». Начало не должно быть позже конца.</span>
        ) : (
          <>Диапазон: —</>
        )}
      </p>
      <div ref={statsHelpRef} className="admin-club-stats-board">
        <button
          type="button"
          className="btn btn-ghost btn-icon-square admin-club-stats-board__help"
          aria-expanded={statsHelpOpen}
          aria-controls="admin-club-stats-help"
          aria-label="Как считаются показатели"
          title="Как считаются показатели"
          onClick={() => setStatsHelpOpen((v) => !v)}
        >
          <Info size={20} aria-hidden />
        </button>
        {statsHelpOpen ? (
          <div id="admin-club-stats-help" className="admin-club-stats-board__popover" role="region" aria-label="Пояснения к показателям">
            <ul className="admin-club-stats-board__popover-list">
              {!isTrainerScope ? (
                <li>
                  <strong>Вкладки ПЗ / ТЗ / АЗ</strong> — цифры только по выбранному залу. Не складывайте три вкладки как «число людей»: один клиент может быть на нескольких.
                </li>
              ) : null}
              <li>
                <strong>Клиенты (всего / действующие / не активные)</strong> —{' '}
                {isTrainerScope
                  ? 'в разделе «Клиенты» (фильтры воронки); здесь не дублируем.'
                  : 'в разделе «Клиенты» по вкладке зала и фильтрам воронки; здесь не дублируем.'}
              </li>
              {showPzOnlyCards ? (
                <>
                  <li>
                    <strong>ПНК → ДК</strong> — дробь: оформления / все ПНК за период; маленький % — конверсия. Только на вкладке ПЗ.
                  </li>
                  <li>
                    <strong>Проведено тренировок</strong> — завершённые за период (планшет ПЗ); список внизу страницы.
                  </li>
                  <li>
                    <strong>По дням</strong> — график завершённых и черновиков по датам.
                  </li>
                </>
              ) : null}
              <li>
                <strong>По типам карт</strong> —{' '}
                {showPzOnlyCards
                  ? 'завершённые тренировки по типу абонемента; «Итого» без «Без типа».'
                  : `сколько абонов ${CLUB_STATS_HALL_LABELS[statsHall] || ''} по типу карты (не тренировки планшета).`}
              </li>
              {showPzOnlyCards ? (
                <>
                  <li>
                    <strong>{isTrainerScope ? 'Итог' : 'Итог по клубу'}</strong> — 12 календарных месяцев выбранного года; график по клику, без «Без типа».
                  </li>
                  {!isTrainerScope ? (
                    <li>
                      <strong>Рейтинг тренеров</strong> — сравнение тренеров клуба.
                    </li>
                  ) : null}
                  <li>
                    <strong>Качество ведения</strong> — {isTrainerScope ? 'ваш балл 0–100' : 'средний балл тренеров 0–100'}; нажмите для таблицы (ведение, глубина, хвосты).
                  </li>
                  <li>
                    <strong>Удержание</strong> — {isTrainerScope ? 'ваш M+3' : 'M+3 по клубу'} (клиенты с планшетом): доля когорт, которые ещё ходили через 3 месяца; нажмите для продлений, архива и тренеров.
                  </li>
                </>
              ) : null}
            </ul>
            {showPzOnlyCards ? (
              <p className="admin-club-stats-board__popover-note">
                По тренировкам в периоде: черновиков <strong>{totalDraft}</strong>, уникальных клиентов в записях (завершена или черновик) —{' '}
                <strong>{uniqueClients}</strong>.
              </p>
            ) : (
              <p className="admin-club-stats-board__popover-note">
                На ТЗ/АЗ нет журнала тренировок планшета и ПНК — это контур персонального зала.
              </p>
            )}
          </div>
        ) : null}

        <div className="admin-club-stats-board__grid">
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'pnk')}
            aria-label={
              pnkFunnel
                ? `ПНК в ДК: ${pnkFunnel.won} из ${pnkFunnel.entered}, ${pnkFunnel.conversionPct} процентов. Нажмите для отчёта`
                : 'ПНК в ДК: нет данных'
            }
            title={pnkFunnel ? 'Подробный отчёт по воронке ПНК' : undefined}
            onClick={() => toggleInlinePanel('pnk')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">ПНК → ДК</h3>
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
            <p className="admin-club-stat-card__foot">
              {inlinePanel === 'pnk'
                ? 'скрыть отчёт'
                : isTrainerScope
                  ? 'нажмите · ПНК'
                  : 'нажмите · оформления / ПНК'}
            </p>
          </button>
          ) : null}

          {showPzOnlyCards ? (
          <button
            type="button"
            className="card stat-card admin-club-stat-card admin-club-stat-card--clickable"
            disabled={totalCompleted === 0}
            aria-label={
              totalCompleted > 0
                ? `Проведено тренировок: ${totalCompleted}. Нажмите, чтобы открыть список`
                : 'Проведено тренировок: нет за период'
            }
            title={totalCompleted > 0 ? 'Показать список тренировок' : undefined}
            onClick={() => {
              setInlinePanel(null)
              onOpenCompletedJournal?.()
            }}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Проведено тренировок</h3>
              <ClipboardList className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{totalCompleted}</p>
            <p className="admin-club-stat-card__foot">
              {totalCompleted > 0 ? 'нажмите для списка' : 'за выбранный период'}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'byDay')}
            disabled={dayActivityTotal === 0}
            aria-label={
              dayActivityTotal > 0
                ? `По дням: ${dayActivityTotal} записей. Нажмите для графика`
                : 'По дням: нет данных за период'
            }
            title={dayActivityTotal > 0 ? 'График по дням' : undefined}
            onClick={() => toggleInlinePanel('byDay')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">По дням</h3>
              <BarChart3 className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{dayActivityTotal}</p>
            <p className="admin-club-stat-card__foot">
              {dayActivityTotal > 0 ? (inlinePanel === 'byDay' ? 'скрыть график' : 'нажмите для графика') : 'за выбранный период'}
            </p>
          </button>
          ) : null}
          <button
            type="button"
            className={statCardClass(inlinePanel === 'byTypes')}
            disabled={totalCounted === 0}
            aria-label={
              totalCounted > 0
                ? showPzOnlyCards
                  ? `По типам карт: ${totalCounted} записей. Нажмите для таблицы`
                  : `По типам карт ${CLUB_STATS_HALL_LABELS[statsHall] || ''}: ${totalCounted} абонов. Нажмите для таблицы`
                : 'По типам карт: нет данных'
            }
            title={totalCounted > 0 ? 'Таблица по типам' : undefined}
            onClick={() => toggleInlinePanel('byTypes')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">По типам карт</h3>
              <LayoutGrid className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{totalCounted}</p>
            <p className="admin-club-stat-card__foot">
              {totalCounted > 0
                ? inlinePanel === 'byTypes'
                  ? 'скрыть таблицу'
                  : showPzOnlyCards
                    ? 'нажмите для таблицы'
                    : `абоны ${CLUB_STATS_HALL_LABELS[statsHall] || ''} · нажмите`
                : showPzOnlyCards
                  ? 'за выбранный период'
                  : 'нет абонов зала'}
            </p>
          </button>
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'clubMonthly')}
            disabled={!range.end}
            aria-label={
              range.end
                ? `Итог: ${MONTHS_PER_CALENDAR_YEAR} месяцев, ${defaultChartYear} год. Нажмите для графика`
                : 'Итоговая статистика недоступна'
            }
            title={range.end ? `График по месяцам · ${defaultChartYear}` : undefined}
            onClick={() => toggleInlinePanel('clubMonthly')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">{isTrainerScope ? 'Итог' : 'Итог по клубу'}</h3>
              <LineChart className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value admin-club-stat-card__value--months">
              {MONTHS_PER_CALENDAR_YEAR}
              <span className="admin-club-stat-card__value-unit">месяцев</span>
            </p>
            <p className="admin-club-stat-card__foot">
              {inlinePanel === 'clubMonthly'
                ? `скрыть · ${monthlyChartYear}`
                : `год ${defaultChartYear} · не период сверху`}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards && !isTrainerScope ? (
            <button
              type="button"
              className={statCardClass(inlinePanel === 'rating')}
              disabled={!byTrainer.length}
              aria-label={byTrainer.length ? `Рейтинг тренеров: ${byTrainer.length}. Нажмите для раскрытия` : 'Рейтинг тренеров: нет данных'}
              title={byTrainer.length ? 'Рейтинг тренеров' : undefined}
              onClick={() => toggleInlinePanel('rating')}
            >
              <div className="stat-card__top admin-club-stat-card__head">
                <h3 className="td-stat-title admin-club-stat-card__title">Рейтинг тренеров</h3>
                <Trophy className="stat-card__icon" size={22} aria-hidden />
              </div>
              <p className="stat-card__value admin-club-stat-card__value">{byTrainer.length}</p>
              <p className="admin-club-stat-card__foot">
                {byTrainer.length
                  ? inlinePanel === 'rating'
                    ? 'скрыть рейтинг'
                    : 'нажмите · рейтинг'
                  : 'за выбранный период'}
              </p>
            </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'coachQuality')}
            disabled={!hasCoachQualityRows || coachQualityBusy}
            aria-busy={coachQualityBusy || undefined}
            aria-label={
              coachQualityBusy
                ? 'Качество ведения: считаем'
                : hasCoachQualityRows
                  ? isTrainerScope
                    ? `Качество ведения: ${coachQualityCardValue != null ? `${coachQualityCardValue} из 100` : 'нет балла'}. Нажмите для таблицы`
                    : `Качество ведения: средний балл ${coachQualityCardValue != null ? coachQualityCardValue : 'нет'}. Нажмите для таблицы`
                  : 'Качество ведения: нет данных'
            }
            title={hasCoachQualityRows && !coachQualityBusy ? 'Таблица качества ведения' : undefined}
            onClick={() => toggleInlinePanel('coachQuality')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Качество ведения</h3>
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
            <p className="admin-club-stat-card__foot">
              {coachQualityBusy
                ? 'считаем…'
                : !hasCoachQualityRows
                  ? 'за выбранный период'
                  : inlinePanel === 'coachQuality'
                    ? 'скрыть таблицу'
                    : isTrainerScope
                      ? 'нажмите · ваша оценка'
                      : 'средний балл · нажмите'}
            </p>
          </button>
          ) : null}
          {showPzOnlyCards ? (
          <button
            type="button"
            className={statCardClass(inlinePanel === 'clientRetention')}
            disabled={!hasClientRetention || clientRetentionBusy}
            aria-busy={clientRetentionBusy || undefined}
            aria-label={
              clientRetentionBusy
                ? 'Удержание: считаем'
                : hasClientRetention
                  ? `Удержание M+3: ${formatRetentionRatePct(clientRetentionM3)}. Нажмите для подробностей`
                  : 'Удержание: нет данных'
            }
            title={hasClientRetention && !clientRetentionBusy ? 'Удержание клиентов' : undefined}
            onClick={() => toggleInlinePanel('clientRetention')}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Удержание</h3>
              <TrendingUp className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">
              {clientRetentionBusy ? '…' : formatRetentionRatePct(clientRetentionM3)}
            </p>
            <p className="admin-club-stat-card__foot">
              {clientRetentionBusy
                ? 'считаем…'
                : !hasClientRetention
                  ? 'клиенты с планшетом'
                  : inlinePanel === 'clientRetention'
                    ? 'скрыть подробности'
                    : 'M+3 · нажмите'}
            </p>
          </button>
          ) : null}
        </div>
      </div>

      {inlinePanel === 'pnk' && pnkFunnel && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
            Воронка ПНК за период
          </h3>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
            Дробь <strong>{pnkFunnel.won}/{pnkFunnel.entered}</strong> — сколько оформили в ДК из всех ПНК, попавших в период
            (по дате создания). Процент — та же конверсия мелко. Открытый ПНК сюда входит, в «Всего клиентов» клуба — нет,
            пока не оформлен.
          </p>
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
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.4 }}>
            Дальше здесь появятся доли с полной картой здоровья, обмерами и «слабыми» пропусками шагов — тот же язык, что в
            «Итоге визита» у админа на карточке клиента.
          </p>
        </section>
      ) : null}

      {inlinePanel === 'byDay' && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            {isTrainerScope ? 'По дням' : 'По дням (клуб)'}
          </h3>
          <AdminClubDayChart byDay={byDay} maxDayTotal={maxDayTotal} />
        </section>
      ) : null}

      {inlinePanel === 'byTypes' ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            {showPzOnlyCards
              ? 'По типам абонементов'
              : `По типам абонементов · ${CLUB_STATS_HALL_LABELS[statsHall] || ''}`}
          </h3>
          {!showPzOnlyCards ? (
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.4 }}>
              Считаем абоны выбранного зала по типу карты (не тренировки планшета ПЗ).
            </p>
          ) : null}
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
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            {isTrainerScope
              ? `Итоговая статистика · ${monthlyChartYear}`
              : `Итоговая статистика по клубу · ${monthlyChartYear}`}
          </h3>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.4 }}>
            Столбцы — по всем календарным месяцам {monthlyChartYear} года (янв–дек), независимо от периода сводки выше.
          </p>
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
              <AdminClubMonthlyChart rows={clubMonthly} year={monthlyChartYear} />
            </>
          )}
          {monthlyYears.length ? (
            <div className="row td-period__buttons admin-monthly-year-tabs" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              {monthlyYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`btn ${monthlyChartYear === y ? 'btn-primary' : 'btn-ghost'}`}
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
          ) : null}
        </section>
      ) : null}

      {inlinePanel === 'rating' && showPzOnlyCards ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            Тренеры — рейтинг по завершённым
          </h3>
          {byTrainer.length === 0 ? (
            <div className="os-empty-card" role="status">
              <p className="os-empty-card__title">Нет данных по тренерам</p>
              <p className="os-empty-card__hint">За выбранный период нет завершённых тренировок по тренерам клуба.</p>
            </div>
          ) : (
            <div className="trainer-rating-grid os-enter">
              {byTrainer.map((tr, idx) => {
                const q = coachQualityByTrainer.get(String(tr.trainerId))
                const name = trainerLabel(tr.trainerId)
                return (
                  <TrainerRatingCard
                    key={tr.trainerId}
                    rank={idx + 1}
                    name={name}
                    completed={tr.completed}
                    draft={tr.draft}
                    clients={tr.uniqueClients}
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
        <div id="admin-coach-quality-panel">
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
        <div id="admin-client-retention-panel">
          <ClientRetentionPanel
            clientRetention={s?.clientRetention}
            trainerLabel={trainerLabel}
            selfTrainerId={isTrainerScope ? scopeTrainerId : null}
            compact={isTrainerScope}
          />
        </div>
      ) : null}

    </section>
  )
}
