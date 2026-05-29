import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ClipboardList, Info, LayoutGrid, RefreshCw, Trophy, UserCheck, UserX, Users } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { loadClubTrainingStats, listTrainerSummariesForAdmin, listClubsLocal } from '../../lib/dataAccess'
import { useDebouncedStorageReload, shouldReloadAdminStatsPage } from '../../lib/useDebouncedStorageReload'
import { formatIsoRu, getDateRange, PERIOD_PRESETS } from '../../lib/period'
import { formatDateRu } from '../../lib/dateRu'
import { AdminClubDayChart } from '../../components/AdminClubDayChart'
import { MembershipTypeStatsTable } from '../../components/MembershipTypeStatsTable'

function rankMedal(i) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `${i + 1}.`
}

/** @typedef {'byDay' | 'byTypes'} AdminStatsInlinePanel */

/**
 * @param {{
 *   clubId: string,
 *   onActiveRangeChange?: (r: { start: string, end: string } | null) => void,
 *   onOpenCompletedJournal?: () => void,
 *   onOpenNotRenewed?: (clients: object[]) => void,
 * }} props
 */
export function AdminClubStatsSection({ clubId, onActiveRangeChange, onOpenCompletedJournal, onOpenNotRenewed }) {
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState(null)
  const [trainerNameById, setTrainerNameById] = useState({})
  const [clubLabel, setClubLabel] = useState('')
  const [statsHelpOpen, setStatsHelpOpen] = useState(false)
  /** @type {[AdminStatsInlinePanel | null, Function]} */
  const [inlinePanel, setInlinePanel] = useState(null)
  const statsHelpRef = useRef(null)

  const range = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo])

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
    if (!clubId) {
      setTrainerNameById({})
      return
    }
    void reloadNames()
  }, [clubId, reloadNames])

  useEffect(() => {
    setStatsHelpOpen(false)
    setInlinePanel(null)
  }, [clubId, range.start, range.end])

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
      if (!clubId) {
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
  }, [clubId])

  const loadStats = useCallback(async ({ silent = false } = {}) => {
    if (!clubId || !range.start || !range.end || range.start > range.end) {
      setStats(null)
      return
    }
    if (!silent) setBusy(true)
    try {
      const s = await loadClubTrainingStats({
        clubId,
        dateFrom: range.start,
        dateTo: range.end,
      })
      setStats(s)
    } catch {
      setStats(null)
    } finally {
      if (!silent) setBusy(false)
    }
  }, [clubId, range.start, range.end])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useDebouncedStorageReload(() => void loadStats({ silent: true }), { shouldRun: shouldReloadAdminStatsPage })

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
    return trainerNameById[id] ?? (String(id).length > 10 ? `Тренер ${String(id).slice(0, 8)}…` : id)
  }

  if (!clubId) {
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
  const totalClients = s?.totalClients ?? 0
  const activeWithMembership = s?.activeWithMembership ?? 0
  const notRenewedInPeriod = s?.notRenewedInPeriod ?? 0
  const notRenewedClients = s?.notRenewedClients ?? []
  const byDay = s?.byDay ?? []
  const byTrainer = s?.byTrainer ?? []
  const byType = s?.byType ?? []
  const byTrainerByType = s?.byTrainerByType ?? []
  const totalCounted = s?.totalCounted ?? 0

  const toggleInlinePanel = (panel) => {
    setInlinePanel((cur) => (cur === panel ? null : panel))
  }

  const statCardClass = (active) =>
    ['card', 'stat-card', 'admin-club-stat-card', 'admin-club-stat-card--clickable', active ? 'admin-club-stat-card--active' : '']
      .filter(Boolean)
      .join(' ')

  return (
    <section className="card">
      <div className="td-section-head">
        <h2 className="section-title td-section-title" style={{ margin: 0 }}>
          Статистика клуба
        </h2>
        <div className="row td-actions">
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => {
              void reloadNames()
              void loadStats()
            }}
            aria-label="Обновить статистику"
            title="Обновить"
          >
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
        {clubLabel ? (
          <>
            Клуб: <strong>{clubLabel}</strong>
            {s?.source === 'remote' ? (
              <> · данные из <strong>Supabase</strong>.</>
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
      {s?.fallbackReason ? <p className="muted admin-inline-note">Резерв: локальный кэш. Причина: {s.fallbackReason}</p> : null}

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
              <li>
                <strong>Всего клиентов</strong> — записи клиентов, привязанные к выбранному клубу.
              </li>
              <li>
                <strong>Действующие</strong> — на последний день периода есть абонемент в сроке с оставшимися тренировками.
              </li>
              <li>
                <strong>Не продлилось</strong> — абонемент закончился в периоде, на конец периода продления нет; нажмите карточку для списка внизу страницы.
              </li>
              <li>
                <strong>Проведено тренировок</strong> — завершённые за период; список внизу страницы.
              </li>
              <li>
                <strong>По дням</strong> — график завершённых и черновиков по датам.
              </li>
              <li>
                <strong>По типам карт</strong> — таблица: тренеры и типы абонементов.
              </li>
            </ul>
            <p className="admin-club-stats-board__popover-note">
              По тренировкам в периоде: черновиков <strong>{totalDraft}</strong>, уникальных клиентов в записях (завершена или черновик) —{' '}
              <strong>{uniqueClients}</strong>.
            </p>
          </div>
        ) : null}

        <div className="admin-club-stats-board__grid">
          <div className="card stat-card admin-club-stat-card">
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Всего клиентов</h3>
              <Users className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{totalClients}</p>
            <p className="admin-club-stat-card__foot" aria-hidden="true">
              {'\u00a0'}
            </p>
          </div>
          <div className="card stat-card admin-club-stat-card">
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Действующих</h3>
              <UserCheck className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{activeWithMembership}</p>
            <p className="admin-club-stat-card__foot">с абонементом на конец периода</p>
          </div>
          <button
            type="button"
            className="card stat-card admin-club-stat-card admin-club-stat-card--clickable"
            disabled={notRenewedInPeriod === 0}
            aria-label={
              notRenewedInPeriod > 0
                ? `Не продлилось: ${notRenewedInPeriod}. Нажмите, чтобы увидеть список клиентов`
                : 'Не продлилось: нет клиентов за период'
            }
            title={notRenewedInPeriod > 0 ? 'Показать список клиентов' : undefined}
            onClick={() => {
              setInlinePanel(null)
              onOpenNotRenewed?.(notRenewedClients)
            }}
          >
            <div className="stat-card__top admin-club-stat-card__head">
              <h3 className="td-stat-title admin-club-stat-card__title">Не продлилось</h3>
              <UserX className="stat-card__icon" size={22} aria-hidden />
            </div>
            <p className="stat-card__value admin-club-stat-card__value">{notRenewedInPeriod}</p>
            <p className="admin-club-stat-card__foot">
              {notRenewedInPeriod > 0 ? 'нажмите для списка' : 'за выбранный период'}
            </p>
          </button>
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
          <button
            type="button"
            className={statCardClass(inlinePanel === 'byTypes')}
            disabled={totalCounted === 0}
            aria-label={
              totalCounted > 0
                ? `По типам карт: ${totalCounted}. Нажмите для таблицы`
                : 'По типам карт: нет данных за период'
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
              {totalCounted > 0 ? (inlinePanel === 'byTypes' ? 'скрыть таблицу' : 'нажмите для таблицы') : 'за выбранный период'}
            </p>
          </button>
        </div>
      </div>

      {inlinePanel === 'byDay' ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            По дням (клуб)
          </h3>
          <AdminClubDayChart byDay={byDay} maxDayTotal={maxDayTotal} />
        </section>
      ) : null}

      {inlinePanel === 'byTypes' ? (
        <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
            По типам абонементов
          </h3>
          <MembershipTypeStatsTable byType={byType} byTrainerByType={byTrainerByType} trainerLabel={trainerLabel} />
        </section>
      ) : null}

      <h3 className="section-title" style={{ fontSize: '1rem', margin: '24px 0 10px' }}>
        Тренеры — рейтинг по завершённым
      </h3>
      {byTrainer.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Нет данных по тренерам за период.
        </p>
      ) : (
        <div className="grid grid-2" style={{ gap: 10 }}>
          {byTrainer.map((tr, idx) => (
            <div key={tr.trainerId} className="card" style={{ padding: 12, margin: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }} aria-hidden>
                  {rankMedal(idx)}
                </span>
                <Trophy size={18} className="muted" style={{ opacity: 0.5 }} aria-hidden />
              </div>
              <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{trainerLabel(tr.trainerId)}</p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 12, fontSize: 13 }}>
                <span>
                  <span className="muted">Завершено:</span> <strong>{tr.completed}</strong>
                </span>
                <span>
                  <span className="muted">Черновики:</span> <strong>{tr.draft}</strong>
                </span>
                <span>
                  <span className="muted">Клиентов:</span> <strong>{tr.uniqueClients}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </section>
  )
}
