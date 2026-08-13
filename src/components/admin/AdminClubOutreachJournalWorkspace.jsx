import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import { fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import { filterClubCallLogRowsByStatus } from '../../lib/admin/clubCallLogCore.js'
import { filterClubSmsLogRowsByStatus } from '../../lib/admin/clubSmsLogCore.js'
import { buildClubCallStats, buildClubSmsStats } from '../../lib/admin/clubOutreachStatsCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { AdminClubOutreachStatsPanel } from './AdminClubOutreachStatsPanel.jsx'
import '../../styles/club-call.css'

const PERIODS = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
]

const TABS = [
  { id: 'list', label: 'Список звонков' },
  { id: 'call-stats', label: 'Сводка звонков' },
  { id: 'sms', label: 'Учёт SMS' },
]

const STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'ok', label: 'Ушло' },
  { id: 'fail', label: 'Ошибки' },
]

function formatWhen(iso) {
  const s = String(iso ?? '')
  const day = s.slice(0, 10)
  const time = s.includes('T') ? s.slice(11, 16) : ''
  const ru = day ? formatDateRu(day) : '—'
  return time ? `${ru}, ${time}` : ru
}

function formatPhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  return phone || '—'
}

/**
 * Журнал связи клуба: список звонков + сводка + учёт SMS.
 * @param {{ clubId: string }} props
 */
export function AdminClubOutreachJournalWorkspace({ clubId }) {
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
  const smsStats = useMemo(() => buildClubSmsStats(smsRows), [smsRows])
  const visibleCalls = useMemo(
    () => filterClubCallLogRowsByStatus(callRows, statusFilter),
    [callRows, statusFilter],
  )
  const visibleSms = useMemo(
    () => filterClubSmsLogRowsByStatus(smsRows, statusFilter),
    [smsRows, statusFilter],
  )

  return (
    <section className="card club-call-journal club-outreach-journal">
      <div className="club-call-journal__head">
        <div>
          <h2 className="section-title">Журнал связи клуба</h2>
          <p className="muted admin-outreach-templates__intro">
            Список и сводка исходящих звонков (как учёт в зале) плюс отчётность по SMS. Период общий для
            всех вкладок.
          </p>
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

      <div className="club-call-journal__periods" role="group" aria-label="Период">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-touch club-call-journal__period${period === p.id ? ' club-call-journal__period--on' : ' btn-ghost'}`}
            onClick={() => setPeriod(p.id)}
            disabled={loading}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="club-outreach-journal__tabs" role="tablist" aria-label="Разделы журнала">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`btn btn-touch club-outreach-journal__tab${tab === t.id ? ' club-outreach-journal__tab--on' : ' btn-ghost'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err ? (
        <p className="admin-outreach-templates__error" role="alert">
          {err}
        </p>
      ) : null}

      {tab === 'list' ? (
        <>
          <div className="club-call-journal__periods" role="group" aria-label="Статус">
            {STATUS_FILTERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-touch club-call-journal__period${statusFilter === p.id ? ' club-call-journal__period--on' : ' btn-ghost'}`}
                onClick={() => setStatusFilter(p.id)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!loading && !err ? (
            <p className="club-call-journal__summary muted" role="status">
              Звонков: <strong>{callStats.total}</strong>
              {' · '}
              ушло <strong>{callStats.ok}</strong>
              {' · '}
              ошибок <strong>{callStats.fail}</strong>
            </p>
          ) : null}
          {loading ? <p className="muted">Загрузка…</p> : null}
          {!loading && !err && visibleCalls.length === 0 ? (
            <p className="muted">Нет звонков за период.</p>
          ) : null}
          {!loading && !err && visibleCalls.length > 0 ? (
            <ul className="club-call-journal__list">
              {visibleCalls.map((row) => {
                const fail = row.status === 'fail'
                return (
                  <li
                    key={row.id}
                    className={`club-call-journal__row${fail ? ' club-call-journal__row--fail' : ''}`}
                  >
                    <div className="club-call-journal__meta">
                      <span className="club-call-journal__when">{formatWhen(row.created_at)}</span>
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
                    <div className="club-call-journal__phone muted">{formatPhone(row.phone)}</div>
                    {fail && row.error_message ? (
                      <p className="club-call-journal__error">{row.error_message}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      ) : null}

      {tab === 'call-stats' ? (
        <AdminClubOutreachStatsPanel
          stats={callStats}
          loading={loading}
          emptyHint="Нет звонков за период — сводка появится после первых вызовов."
          okLabel="Ушло"
        />
      ) : null}

      {tab === 'sms' ? (
        <>
          <div className="club-call-journal__periods" role="group" aria-label="Статус SMS">
            {STATUS_FILTERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-touch club-call-journal__period${statusFilter === p.id ? ' club-call-journal__period--on' : ' btn-ghost'}`}
                onClick={() => setStatusFilter(p.id)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
          </div>
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
                        <span className="club-call-journal__when">{formatWhen(row.created_at)}</span>
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
    </section>
  )
}
