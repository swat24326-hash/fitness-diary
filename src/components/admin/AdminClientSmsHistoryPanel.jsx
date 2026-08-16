/**
 * История SMS одного клиента (встроенная в окно истории связи).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import {
  CLUB_SMS_LOG_MAX_LOOKBACK_DAYS,
  filterClubSmsLogRowsByStatus,
  summarizeClubSmsLogRows,
} from '../../lib/admin/clubSmsLogCore.js'
import {
  CLIENT_OUTREACH_RANGE_ALL,
  clientOutreachHistorySummaryPrefix,
  filterClubSmsLogsByClientId,
  normalizeClientOutreachRangeMode,
  resolveClientOutreachHistoryFetchOpts,
} from '../../lib/admin/clientOutreachHistoryRangeCore.js'
import { OUTREACH_SCENARIO_LABELS } from '../../lib/trainer/trainerClientOutreachCore.js'
import { formatDateTimeRu, todayInTimeZoneIso } from '../../lib/dateRu.js'
import '../../styles/club-sms-journal.css'
import '../../styles/club-call.css'

const STATUS_FILTERS = [
  { id: 'all', label: 'Все статусы' },
  { id: 'ok', label: 'Ушло' },
  { id: 'fail', label: 'Ошибки' },
]

function scenarioLabel(scenario) {
  const s = String(scenario ?? '')
  if (OUTREACH_SCENARIO_LABELS[s]) return OUTREACH_SCENARIO_LABELS[s]
  if (s === 'custom') return 'Свой текст'
  return s || '—'
}

/**
 * @param {{
 *   clubId: string,
 *   clientId: string,
 *   rangeMode?: 'day' | 'all',
 *   day?: string,
 *   reloadToken?: number,
 * }} props
 */
export function AdminClientSmsHistoryPanel({
  clubId,
  clientId,
  rangeMode: rangeModeProp = 'day',
  day = '',
  reloadToken = 0,
}) {
  const statusFieldId = useId()
  const rangeMode = normalizeClientOutreachRangeMode(rangeModeProp)
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const reloadGenRef = useRef(0)

  const reload = useCallback(async () => {
    const gen = ++reloadGenRef.current
    if (!String(clubId ?? '').trim() || !String(clientId ?? '').trim()) {
      if (gen !== reloadGenRef.current) return
      setRows([])
      setErr(!clubId ? 'Выберите клуб.' : 'Нет клиента.')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const fetchOpts = resolveClientOutreachHistoryFetchOpts({
        rangeMode,
        day,
        kind: 'sms',
        todayIso: todayInTimeZoneIso(),
      })
      if (fetchOpts.summaryScope === 'day' && !fetchOpts.day) {
        if (gen !== reloadGenRef.current) return
        setRows([])
        setErr('Не выбран день журнала')
        setLoading(false)
        return
      }
      const list = await fetchClubSmsLogs(clubId, {
        ...(fetchOpts.day ? { day: fetchOpts.day } : {}),
        ...(fetchOpts.sinceDays && !fetchOpts.day ? { sinceDays: fetchOpts.sinceDays } : {}),
        clientId: String(clientId),
      })
      if (gen !== reloadGenRef.current) return
      setRows(filterClubSmsLogsByClientId(list, clientId))
    } catch (e) {
      if (gen !== reloadGenRef.current) return
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить SMS')
    } finally {
      if (gen === reloadGenRef.current) setLoading(false)
    }
  }, [clubId, clientId, rangeMode, day])

  useEffect(() => {
    void reload()
  }, [reload, reloadToken])

  const summary = useMemo(() => summarizeClubSmsLogRows(rows), [rows])
  const visible = useMemo(
    () => filterClubSmsLogRowsByStatus(rows, statusFilter),
    [rows, statusFilter],
  )
  const summaryPrefix = clientOutreachHistorySummaryPrefix(
    rangeMode === CLIENT_OUTREACH_RANGE_ALL ? 'all' : 'day',
    CLUB_SMS_LOG_MAX_LOOKBACK_DAYS,
  )
  const emptyHint =
    rangeMode === CLIENT_OUTREACH_RANGE_ALL
      ? `Этому клиенту ещё не писали SMS за ${CLUB_SMS_LOG_MAX_LOOKBACK_DAYS} дн.`
      : 'Этому клиенту ещё не писали SMS за этот день.'

  return (
    <section className="club-call-journal club-call-journal--embedded club-call-journal--body-only" aria-label="История SMS">
      <div className="club-call-journal__head">
        <div className="club-call-journal__head-spacer" aria-hidden />
        <div className="club-call-journal__head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            onClick={() => void reload()}
            disabled={loading || !clubId}
            aria-label="Обновить историю SMS"
            title="Обновить"
          >
            <RefreshCw size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className="club-call-journal__toolbar">
        <div className="club-call-journal__filters club-call-journal__filters--inline">
          <label className="club-call-journal__filter-label" htmlFor={statusFieldId}>
            Статус
          </label>
          <select
            id={statusFieldId}
            className="select club-call-journal__status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={loading}
            aria-label="Статус SMS"
          >
            {STATUS_FILTERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && !err && rows.length > 0 ? (
        <p className="club-sms-journal__summary muted" role="status">
          {summaryPrefix}: <strong>{summary.total}</strong>
          {' · '}
          ушло <strong>{summary.ok}</strong>
          {' · '}
          ошибок <strong>{summary.fail}</strong>
        </p>
      ) : null}

      {err ? (
        <p className="admin-outreach-templates__error club-call-journal__alert" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? <p className="muted">Загрузка SMS…</p> : null}

      {!loading && !err && visible.length === 0 ? (
        <p className="muted club-call-journal__empty">
          {rows.length === 0 ? emptyHint : 'Нет записей с таким статусом.'}
        </p>
      ) : null}

      {!loading && !err && visible.length > 0 ? (
        <ul className="club-sms-journal__list" aria-label="SMS этому клиенту">
          {visible.map((row) => {
            const isFail = String(row.status ?? 'ok') === 'fail'
            return (
              <li
                key={row.id || `${row.client_id}-${row.created_at}`}
                className={`club-sms-journal__row${isFail ? ' club-sms-journal__row--fail' : ''}`}
              >
                <div className="club-sms-journal__meta">
                  <span className="club-sms-journal__when">{formatDateTimeRu(row.created_at)}</span>
                  <span
                    className={`club-sms-journal__status${isFail ? ' club-sms-journal__status--fail' : ' club-sms-journal__status--ok'}`}
                  >
                    {isFail ? 'Ошибка' : 'Ушло'}
                  </span>
                  <span className="club-sms-journal__scenario">{scenarioLabel(row.scenario)}</span>
                </div>
                <div className="club-sms-journal__who">
                  <span className="muted">{row.sent_by_name || 'сотрудник'}</span>
                </div>
                {isFail && row.error_message ? (
                  <p className="club-sms-journal__error">{row.error_message}</p>
                ) : null}
                {row.message_preview ? (
                  <p className="club-sms-journal__preview muted">{row.message_preview}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
