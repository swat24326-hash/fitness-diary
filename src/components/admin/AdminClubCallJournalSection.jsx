import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import {
  filterClubCallLogRowsByStatus,
  summarizeClubCallLogRows,
} from '../../lib/admin/clubCallLogCore.js'
import { AdminClubCallJournalTable } from './AdminClubCallJournalTable.jsx'
import { ClubOutreachDayStepper } from './ClubOutreachDayStepper.jsx'
import { CLUB_CALL_UI_LABEL } from '../../lib/admin/clubCallOutcomeCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import '../../styles/club-call.css'

const STATUS_FILTERS_CLUB = [
  { id: 'all', label: 'Все' },
  { id: 'inbound', label: 'Входящие' },
  { id: 'outbound', label: 'Исходящие' },
  { id: 'inbound_missed', label: 'Проп. входящие' },
  { id: 'answered', label: CLUB_CALL_UI_LABEL.answered },
  { id: 'missed', label: CLUB_CALL_UI_LABEL.missed },
  { id: 'fail', label: CLUB_CALL_UI_LABEL.fail },
]

const STATUS_FILTERS_CLIENT = [
  { id: 'all', label: 'Все статусы' },
  { id: 'answered', label: CLUB_CALL_UI_LABEL.answered },
  { id: 'missed', label: CLUB_CALL_UI_LABEL.missed },
  { id: 'short', label: CLUB_CALL_UI_LABEL.short },
  { id: 'fail', label: CLUB_CALL_UI_LABEL.fail },
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
  const statusFilters = forClient ? STATUS_FILTERS_CLIENT : STATUS_FILTERS_CLUB
  const statusFieldId = useId()
  const [day, setDay] = useState(() => todayInTimeZoneIso())
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const heading = title || (forClient ? 'История звонков' : 'Журнал звонков клуба')
  const lead =
    intro ||
    (forClient
      ? 'Исходящие с телефона клуба этому человеку за выбранный день: кто звонил, исход, запись и пометка.'
      : '«Набор…» = команда ушла на телефон, ждём исход. «Дозвон / Не взял / Сброс» — после звонка. Пометку можно добавить в строке.')

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
        day,
        clientId: forClient ? String(clientId) : undefined,
      })
      setRows(list)
    } catch (e) {
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [clubId, clientId, forClient, day])

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

      <div className="club-call-journal__toolbar">
        <ClubOutreachDayStepper value={day} onChange={setDay} disabled={loading} />
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
            aria-label="Фильтр по статусу"
          >
            {statusFilters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && !err && rows.length > 0 ? (
        <p className="club-call-journal__summary muted" role="status">
          За день: <strong>{summary.total}</strong>
          {' · '}
          набор <strong>{summary.ok}</strong>
          {' · '}
          сбой <strong>{summary.fail}</strong>
          {summary.answered || summary.missed || summary.short ? (
            <>
              {' · '}
              дозвон <strong>{summary.answered ?? 0}</strong>
              {' · '}
              не взял <strong>{summary.missed ?? 0}</strong>
              {' · '}
              сброс <strong>{summary.short ?? 0}</strong>
            </>
          ) : null}
        </p>
      ) : null}

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
              ? 'По этому клиенту ещё нет звонков за этот день.'
              : 'Пока нет звонков за выбранный день.'
            : 'Нет записей с этим фильтром.'}
        </p>
      ) : null}

      {!loading && !err && visible.length > 0 ? (
        <AdminClubCallJournalTable
          rows={visible}
          mode={forClient ? 'client' : 'club'}
          onNoteSaved={(logId, nextNote) => {
            setRows((prev) =>
              prev.map((r) =>
                String(r.id) === String(logId) ? { ...r, staff_note: nextNote } : r,
              ),
            )
          }}
        />
      ) : null}
    </section>
  )
}
