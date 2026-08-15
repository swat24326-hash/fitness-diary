import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import { fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import {
  filterClubCallLogRowsByStatus,
  summarizeClubCallLogRows,
} from '../../lib/admin/clubCallLogCore.js'
import { filterClubSmsLogRowsByStatus } from '../../lib/admin/clubSmsLogCore.js'
import { buildClubCallStats, buildClubSmsStats } from '../../lib/admin/clubOutreachStatsCore.js'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { AdminClubOutreachStatsPanel } from './AdminClubOutreachStatsPanel.jsx'
import { AdminClubCallJournalRow } from './AdminClubCallJournalRow.jsx'
import { ClubOutreachPeriodStepper } from './ClubOutreachPeriodStepper.jsx'
import '../../styles/club-call.css'

const PERIODS = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
]

const TABS = [
  { id: 'list', label: 'Список' },
  { id: 'call-stats', label: 'Сводка' },
  { id: 'sms', label: 'SMS' },
]

const STATUS_FILTERS = [
  { id: 'all', label: 'Все статусы' },
  { id: 'ok', label: 'Команда ушла' },
  { id: 'fail', label: 'Ошибки' },
]

/**
 * Журнал связи клуба: список звонков + сводка + учёт SMS.
 * @param {{ clubId: string, layout?: 'page' | 'card' }} props
 */
export function AdminClubOutreachJournalWorkspace({ clubId, layout = 'card' }) {
  const isPage = layout === 'page'
  const [period, setPeriod] = useState('14')
  const [tab, setTab] = useState('list')
  const [statusFilter, setStatusFilter] = useState('all')
  const [callRows, setCallRows] = useState([])
  const [smsRows, setSmsRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const sinceDays = PERIODS.find((p) => p.id === period)?.days ?? 14

  const reload = useCallback(async () => {
    if (!clubId) {
      setCallRows([])
      setSmsRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const [calls, sms] = await Promise.all([
        fetchClubCallLogs(clubId, { sinceDays }),
        fetchClubSmsLogs(clubId, { sinceDays }),
      ])
      setCallRows(calls)
      setSmsRows(sms)
    } catch (e) {
      setCallRows([])
      setSmsRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [clubId, sinceDays])

  useEffect(() => {
    void reload()
  }, [reload])

  const callStats = useMemo(() => buildClubCallStats(callRows), [callRows])
  const callSummary = useMemo(() => summarizeClubCallLogRows(callRows), [callRows])
  const smsStats = useMemo(() => buildClubSmsStats(smsRows), [smsRows])
  const visibleCalls = useMemo(
    () => filterClubCallLogRowsByStatus(callRows, statusFilter),
    [callRows, statusFilter],
  )
  const visibleSms = useMemo(
    () => filterClubSmsLogRowsByStatus(smsRows, statusFilter),
    [smsRows, statusFilter],
  )

  const sectionClass = [
    'card',
    'club-call-journal',
    'club-outreach-journal',
    isPage ? 'club-outreach-journal--page' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const listScrollLabel =
    tab === 'sms' ? 'Список SMS' : tab === 'call-stats' ? 'Сводка звонков' : 'Список звонков'

  return (
    <section className={sectionClass} aria-label="Журнал связи клуба">
      <div className="club-outreach-journal__chrome">
        <div className="club-call-journal__head">
          <div>
            <h2 className="section-title">{isPage ? 'Журнал звонков' : 'Журнал связи клуба'}</h2>
            {!isPage ? (
              <p className="muted admin-outreach-templates__intro">
                «Команда ушла» — API Мои Звонки принял make_call. «Отвечен / Пропущен / Короткий» — исход с
                Android после webhook. SMS — отдельный учёт команд отправки.
              </p>
            ) : (
              <p className="muted club-outreach-journal__lead">
                Список, сводка и SMS. «Команда ушла» ≠ дозвон — исход после webhook.
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            onClick={() => void reload()}
            disabled={loading || !clubId}
            aria-label="Обновить"
            title="Обновить"
          >
            <RefreshCw size={18} aria-hidden />
          </button>
        </div>

        <div className="club-outreach-journal__toolbar">
          <div className="tabs club-outreach-journal__tabs" role="tablist" aria-label="Разделы журнала">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ClubOutreachPeriodStepper
            periods={PERIODS}
            value={period}
            onChange={setPeriod}
            disabled={loading}
          />
        </div>

        {tab === 'list' || tab === 'sms' ? (
          <div className="club-call-journal__filters club-call-journal__filters--toolbar">
            <label className="club-call-journal__filter-label" htmlFor="club-outreach-status">
              Статус
            </label>
            <select
              id="club-outreach-status"
              className="select club-call-journal__status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={loading}
              aria-label={tab === 'sms' ? 'Статус SMS' : 'Статус звонка'}
            >
              {STATUS_FILTERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {tab === 'list' && !loading && !err ? (
              <p className="club-call-journal__summary club-call-journal__summary--inline muted" role="status">
                Звонков: <strong>{callSummary.total}</strong>
                {' · '}
                ок <strong>{callSummary.ok}</strong>
                {' · '}
                ош. <strong>{callSummary.fail}</strong>
                {callSummary.answered || callSummary.missed || callSummary.short ? (
                  <>
                    {' · '}
                    отвечен <strong>{callSummary.answered}</strong>
                    {' · '}
                    проп. <strong>{callSummary.missed}</strong>
                    {' · '}
                    кор. <strong>{callSummary.short}</strong>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {err ? (
          <p className="admin-outreach-templates__error" role="alert">
            {err}
          </p>
        ) : null}
      </div>

      <div className="club-outreach-journal__scroll" role="region" aria-label={listScrollLabel}>
        {tab === 'list' ? (
          <>
            {loading ? <p className="muted">Загрузка…</p> : null}
            {!loading && !err && visibleCalls.length === 0 ? (
              <p className="muted">Нет звонков за период.</p>
            ) : null}
            {!loading && !err && visibleCalls.length > 0 ? (
              <ul className="club-call-journal__list">
                {visibleCalls.map((row) => (
                  <AdminClubCallJournalRow key={row.id} row={row} mode="club" />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {tab === 'call-stats' ? (
          <AdminClubOutreachStatsPanel
            stats={callStats}
            loading={loading}
            emptyHint="Нет звонков за период — сводка появится после первых вызовов."
            okLabel="Команда ок"
          />
        ) : null}

        {tab === 'sms' ? (
          <>
            <AdminClubOutreachStatsPanel
              stats={smsStats}
              loading={loading}
              emptyHint="Нет SMS за период."
              okLabel="Ушло"
            />
            {!loading && !err && visibleSms.length > 0 ? (
              <>
                <h3 className="club-call-stats__h">Последние SMS</h3>
                <ul className="club-call-journal__list">
                  {visibleSms.slice(0, 40).map((row) => {
                    const fail = row.status === 'fail'
                    return (
                      <li
                        key={row.id}
                        className={`club-call-journal__row${fail ? ' club-call-journal__row--fail' : ''}`}
                      >
                        <div className="club-call-journal__meta">
                          <span className="club-call-journal__when">{formatDateTimeRu(row.created_at)}</span>
                          <span
                            className={`club-call-journal__status${fail ? ' club-call-journal__status--fail' : ''}`}
                          >
                            {fail ? 'Ошибка' : 'Ушло'}
                          </span>
                        </div>
                        <div className="club-call-journal__who">
                          {row.client_name || 'Клиент'}
                          {row.sent_by_name ? ` · ${row.sent_by_name}` : ''}
                        </div>
                        {row.message_preview ? (
                          <p className="muted club-call-journal__phone">{row.message_preview}</p>
                        ) : null}
                        {fail && row.error_message ? (
                          <p className="club-call-journal__error">{row.error_message}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
