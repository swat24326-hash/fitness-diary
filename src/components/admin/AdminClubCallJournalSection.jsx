import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import {
  filterClubCallLogRowsByStatus,
  summarizeClubCallLogRows,
} from '../../lib/admin/clubCallLogCore.js'
import { AdminClubCallJournalRow } from './AdminClubCallJournalRow.jsx'
import '../../styles/club-call.css'

const PERIODS_CLUB = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
]

const PERIODS_CLIENT = [
  { id: '14', days: 14, label: '14 дней' },
  { id: '30', days: 30, label: '30 дней' },
  { id: '90', days: 90, label: '90 дней' },
]

const STATUS_FILTERS_CLUB = [
  { id: 'all', label: 'Все' },
  { id: 'ok', label: 'Команда ушла' },
  { id: 'fail', label: 'Ошибки' },
]

const STATUS_FILTERS_CLIENT = [
  { id: 'all', label: 'Все' },
  { id: 'answered', label: 'Отвечен' },
  { id: 'missed', label: 'Пропущен' },
  { id: 'short', label: 'Короткий' },
  { id: 'fail', label: 'Ошибки' },
]

/**
 * Журнал звонков: клубный или история по одному клиенту.
 * @param {{
 *   clubId: string,
 *   clientId?: string | null,
 *   embedded?: boolean,
 *   title?: string,
 *   intro?: string,
 *   headerActions?: import('react').ReactNode,
 *   reloadToken?: number,
 * }} props
 */
export function AdminClubCallJournalSection({
  clubId,
  clientId = null,
  embedded = false,
  title,
  intro,
  headerActions = null,
  reloadToken = 0,
}) {
  const forClient = Boolean(String(clientId ?? '').trim())
  const periods = forClient ? PERIODS_CLIENT : PERIODS_CLUB
  const statusFilters = forClient ? STATUS_FILTERS_CLIENT : STATUS_FILTERS_CLUB
  const [period, setPeriod] = useState(forClient ? '90' : '14')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const sinceDays = periods.find((p) => p.id === period)?.days ?? (forClient ? 90 : 14)
  const heading = title || (forClient ? 'История звонков' : 'Журнал звонков клуба')
  const lead =
    intro ||
    (forClient
      ? 'Все исходящие с телефона клуба этому человеку: кто звонил, исход, длительность, запись и пометка.'
      : '«Команда ушла» = сервер Мои Звонки принял make_call (не факт дозвона). Исход разговора появится после webhook call.finish. Пометку можно добавить в строке.')

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
  }, [reload, reloadToken])

  const summary = useMemo(() => summarizeClubCallLogRows(rows), [rows])
  const visible = useMemo(
    () => filterClubCallLogRowsByStatus(rows, statusFilter),
    [rows, statusFilter],
  )

  const shellClass = embedded
    ? 'club-call-journal club-call-journal--embedded'
    : 'card admin-outreach-templates__section club-call-journal'

  return (
    <section className={shellClass} aria-label={heading}>
      <div className="club-call-journal__head">
        <div>
          <h2 className={embedded ? 'club-call-journal__title' : 'section-title'}>{heading}</h2>
          {!embedded ? (
            <p className="muted admin-outreach-templates__intro">{lead}</p>
          ) : (
            <p className="muted club-call-journal__intro">{lead}</p>
          )}
        </div>
        <div className="club-call-journal__head-actions">
          {headerActions}
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            onClick={() => void reload()}
            disabled={loading || !clubId}
            aria-label="Обновить историю звонков"
            title="Обновить"
          >
            <RefreshCw size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className="club-call-journal__periods" role="group" aria-label="Период">
        {periods.map((p) => (
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
          команда ок <strong>{summary.ok}</strong>
          {' · '}
          ошибок <strong>{summary.fail}</strong>
          {summary.answered || summary.missed || summary.short ? (
            <>
              {' · '}
              отвечен <strong>{summary.answered ?? 0}</strong>
              {' · '}
              пропущен <strong>{summary.missed ?? 0}</strong>
              {' · '}
              коротких <strong>{summary.short ?? 0}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="club-call-journal__periods" role="group" aria-label="Фильтр">
        {statusFilters.map((p) => (
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

      {loading ? <p className="muted">Загрузка истории…</p> : null}

      {!loading && !err && visible.length === 0 ? (
        <p className="muted club-call-journal__empty">
          {rows.length === 0
            ? forClient
              ? 'По этому клиенту ещё нет звонков за период.'
              : 'Пока нет звонков за выбранный период.'
            : 'Нет записей с этим фильтром.'}
        </p>
      ) : null}

      {!loading && !err && visible.length > 0 ? (
        <ul className="club-call-journal__list">
          {visible.map((row) => (
            <AdminClubCallJournalRow
              key={row.id}
              row={row}
              mode={forClient ? 'client' : 'club'}
              onNoteSaved={(logId, nextNote) => {
                setRows((prev) =>
                  prev.map((r) =>
                    String(r.id) === String(logId) ? { ...r, staff_note: nextNote } : r,
                  ),
                )
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
