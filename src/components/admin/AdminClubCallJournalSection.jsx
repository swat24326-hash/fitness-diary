import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import {
  filterClubCallLogRowsByStatus,
  summarizeClubCallLogRows,
} from '../../lib/admin/clubCallLogCore.js'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import '../../styles/club-call.css'

const PERIODS = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
]

const STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'ok', label: 'Ушло' },
  { id: 'fail', label: 'Ошибки' },
]

function formatPhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  return phone || '—'
}

/**
 * Журнал звонков: клубный или по одному клиенту.
 * @param {{
 *   clubId: string,
 *   clientId?: string | null,
 *   embedded?: boolean,
 *   title?: string,
 *   intro?: string,
 * }} props
 */
export function AdminClubCallJournalSection({
  clubId,
  clientId = null,
  embedded = false,
  title,
  intro,
}) {
  const forClient = Boolean(String(clientId ?? '').trim())
  const [period, setPeriod] = useState(forClient ? '30' : '14')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const sinceDays = PERIODS.find((p) => p.id === period)?.days ?? 14
  const heading = title || (forClient ? 'Звонки этому клиенту' : 'Журнал звонков клуба')
  const lead =
    intro ||
    (forClient
      ? 'Исходящие через Мои Звонки с телефона клуба: успех и ошибки команды.'
      : 'Команды «позвонить» через Мои Звонки: успех и ошибки API. Запись разговора — в кабинете Мои Звонки (если включена).')

  const reload = useCallback(async () => {
    if (!clubId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const list = await fetchClubCallLogs(clubId, {
        sinceDays,
        clientId: forClient ? String(clientId) : undefined,
      })
      setRows(list)
    } catch (e) {
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [clubId, clientId, forClient, sinceDays])

  useEffect(() => {
    void reload()
  }, [reload])

  const summary = useMemo(() => summarizeClubCallLogRows(rows), [rows])
  const visible = useMemo(
    () => filterClubCallLogRowsByStatus(rows, statusFilter),
    [rows, statusFilter],
  )

  const shellClass = embedded
    ? 'club-call-journal club-call-journal--embedded'
    : 'card admin-outreach-templates__section club-call-journal'

  return (
    <section className={shellClass}>
      <div className="club-call-journal__head">
        <div>
          <h2 className={embedded ? 'club-call-journal__title' : 'section-title'}>{heading}</h2>
          {!embedded ? (
            <p className="muted admin-outreach-templates__intro">{lead}</p>
          ) : (
            <p className="muted club-call-journal__intro">{lead}</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          onClick={() => void reload()}
          disabled={loading || !clubId}
          aria-label="Обновить журнал звонков"
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

      {!loading && !err && rows.length > 0 ? (
        <p className="club-call-journal__summary muted" role="status">
          За период: <strong>{summary.total}</strong>
          {' · '}
          ушло <strong>{summary.ok}</strong>
          {' · '}
          ошибок <strong>{summary.fail}</strong>
        </p>
      ) : null}

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

      {err ? (
        <p className="admin-outreach-templates__error club-call-journal__alert" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? <p className="muted">Загрузка журнала…</p> : null}

      {!loading && !err && visible.length === 0 ? (
        <p className="muted club-call-journal__empty">
          {rows.length === 0
            ? forClient
              ? 'По этому клиенту ещё нет звонков за период.'
              : 'Пока нет звонков за выбранный период.'
            : 'Нет записей с этим статусом.'}
        </p>
      ) : null}

      {!loading && !err && visible.length > 0 ? (
        <ul className="club-call-journal__list">
          {visible.map((row) => {
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
                  {forClient
                    ? row.sent_by_name
                      ? `Кто: ${row.sent_by_name}`
                      : 'Кто: —'
                    : `${row.client_name || 'Клиент'}${row.sent_by_name ? ` · ${row.sent_by_name}` : ''}`}
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
    </section>
  )
}
