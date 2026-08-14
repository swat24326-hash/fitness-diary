import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import {
  filterClubSmsLogRowsByStatus,
  summarizeClubSmsLogRows,
} from '../../lib/admin/clubSmsLogCore.js'
import { OUTREACH_SCENARIO_LABELS } from '../../lib/trainer/trainerClientOutreachCore.js'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { ClubOutreachPeriodStepper } from './ClubOutreachPeriodStepper.jsx'
import '../../styles/club-sms-journal.css'
import '../../styles/club-call.css'

const PERIODS = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
]

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
 * Журнал облачных SMS клуба — кто / кому / когда / ушло или ошибка.
 * @param {{ clubId: string }} props
 */
export function AdminClubSmsJournalSection({ clubId }) {
  const [period, setPeriod] = useState('14')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const sinceDays = PERIODS.find((p) => p.id === period)?.days ?? 14

  const reload = useCallback(async () => {
    if (!clubId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const list = await fetchClubSmsLogs(clubId, { sinceDays })
      setRows(list)
    } catch (e) {
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [clubId, sinceDays])

  useEffect(() => {
    void reload()
  }, [reload])

  const summary = useMemo(() => summarizeClubSmsLogRows(rows), [rows])
  const visible = useMemo(
    () => filterClubSmsLogRowsByStatus(rows, statusFilter),
    [rows, statusFilter],
  )

  return (
    <section className="card admin-outreach-templates__section club-sms-journal">
      <div className="club-sms-journal__head">
        <div>
          <h2 className="section-title">Журнал SMS клуба</h2>
          <p className="muted admin-outreach-templates__intro">
            Ушло и ошибки на любом устройстве клуба. С доски «Клиенты» журнал открывается из итога массовой.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          onClick={() => void reload()}
          disabled={loading || !clubId}
          aria-label="Обновить журнал"
          title="Обновить"
        >
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>

      <div className="club-call-journal__toolbar">
        <ClubOutreachPeriodStepper
          periods={PERIODS}
          value={period}
          onChange={setPeriod}
          disabled={loading}
        />
        <div className="club-call-journal__filters club-call-journal__filters--inline">
          <label className="club-call-journal__filter-label" htmlFor="club-sms-status">
            Статус
          </label>
          <select
            id="club-sms-status"
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
          За период: <strong>{summary.total}</strong>
          {' · '}
          ушло <strong>{summary.ok}</strong>
          {' · '}
          ошибок <strong>{summary.fail}</strong>
        </p>
      ) : null}

      {err ? (
        <p className="admin-outreach-templates__error" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? <p className="muted">Загрузка журнала…</p> : null}

      {!loading && !err && visible.length === 0 ? (
        <p className="muted club-sms-journal__empty">
          {rows.length === 0
            ? 'За выбранный период SMS ещё не отправляли. Записи появятся после отправки из списка клиентов.'
            : 'Нет записей с таким статусом.'}
        </p>
      ) : null}

      {!loading && visible.length > 0 ? (
        <ul className="club-sms-journal__list" aria-label="Записи журнала SMS">
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
                  <strong>{row.client_name || 'Клиент'}</strong>
                  <span className="muted"> · {row.sent_by_name || 'сотрудник'}</span>
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

      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Массовая рассылка — на доске «Клиенты»; после пачки откроется итог «ушло / ошибки».
      </p>
    </section>
  )
}
