import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubCallLogs } from '../../lib/admin/clubCallService.js'
import {
  CLUB_CALL_LOG_MAX_LOOKBACK_DAYS,
  filterClubCallLogRowsByStatus,
  summarizeClubCallLogRows,
} from '../../lib/admin/clubCallLogCore.js'
import { AdminClubCallJournalTable } from './AdminClubCallJournalTable.jsx'
import { ClubOutreachDayStepper } from './ClubOutreachDayStepper.jsx'
import { CLUB_CALL_UI_LABEL } from '../../lib/admin/clubCallOutcomeCore.js'
import {
  CLIENT_OUTREACH_RANGE_ALL,
  clientOutreachHistorySummaryPrefix,
  normalizeClientOutreachRangeMode,
  resolveClientOutreachHistoryFetchOpts,
} from '../../lib/admin/clientOutreachHistoryRangeCore.js'
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
 *   showHeading?: boolean,
 *   rangeMode?: 'day' | 'all',
 *   day?: string,
 *   onDayChange?: (iso: string) => void,
 *   showDayControls?: boolean,
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
  showHeading = true,
  rangeMode: rangeModeProp,
  day: dayProp,
  onDayChange,
  showDayControls = true,
}) {
  const forClient = Boolean(String(clientId ?? '').trim())
  const statusFilters = forClient ? STATUS_FILTERS_CLIENT : STATUS_FILTERS_CLUB
  const statusFieldId = useId()
  const [dayLocal, setDayLocal] = useState(() => todayInTimeZoneIso())
  const dayControlled = typeof onDayChange === 'function' && dayProp != null
  const day = dayControlled ? String(dayProp).slice(0, 10) : dayLocal
  const setDay = (iso) => {
    if (dayControlled) onDayChange(iso)
    else setDayLocal(iso)
  }
  const rangeMode = normalizeClientOutreachRangeMode(rangeModeProp ?? 'day')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const heading = title || (forClient ? 'История звонков' : 'Журнал звонков клуба')
  const lead =
    intro ||
    (forClient
      ? 'Исходящие с телефона клуба этому человеку: кто звонил, исход, запись и пометка.'
      : '«Набор…» = команда ушла на телефон, ждём исход. «Дозвон / Не взял / Сброс» — после звонка. Пометку можно добавить в строке.')

  const reloadGenRef = useRef(0)

  const reload = useCallback(async () => {
    const gen = ++reloadGenRef.current
    if (!String(clubId ?? '').trim()) {
      if (gen !== reloadGenRef.current) return
      setRows([])
      setErr(forClient ? 'Выберите клуб, чтобы открыть историю звонков.' : 'Выберите клуб.')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const fetchOpts = resolveClientOutreachHistoryFetchOpts({
        rangeMode: forClient ? rangeMode : 'day',
        day,
        kind: 'calls',
        todayIso: todayInTimeZoneIso(),
      })
      if (fetchOpts.summaryScope === 'day' && !fetchOpts.day) {
        if (gen !== reloadGenRef.current) return
        setRows([])
        setErr('Не выбран день журнала')
        setLoading(false)
        return
      }
      const list = await fetchClubCallLogs(clubId, {
        ...(fetchOpts.day ? { day: fetchOpts.day } : {}),
        ...(fetchOpts.sinceDays && !fetchOpts.day ? { sinceDays: fetchOpts.sinceDays } : {}),
        clientId: forClient ? String(clientId) : undefined,
      })
      if (gen !== reloadGenRef.current) return
      setRows(list)
    } catch (e) {
      if (gen !== reloadGenRef.current) return
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      if (gen === reloadGenRef.current) setLoading(false)
    }
  }, [clubId, clientId, forClient, day, rangeMode])

  useEffect(() => {
    void reload()
  }, [reload, reloadToken])

  const summary = useMemo(() => summarizeClubCallLogRows(rows), [rows])
  const visible = useMemo(
    () => filterClubCallLogRowsByStatus(rows, statusFilter),
    [rows, statusFilter],
  )
  const summaryPrefix = clientOutreachHistorySummaryPrefix(
    forClient && rangeMode === CLIENT_OUTREACH_RANGE_ALL ? 'all' : 'day',
    CLUB_CALL_LOG_MAX_LOOKBACK_DAYS,
  )
  const emptyDayHint = forClient
    ? rangeMode === CLIENT_OUTREACH_RANGE_ALL
      ? `По этому клиенту ещё нет звонков за ${CLUB_CALL_LOG_MAX_LOOKBACK_DAYS} дн.`
      : 'По этому клиенту ещё нет звонков за этот день.'
    : 'Пока нет звонков за выбранный день.'

  const shellClass = [
    'club-call-journal',
    embedded ? 'club-call-journal--embedded' : 'card admin-outreach-templates__section',
    !showHeading ? 'club-call-journal--body-only' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={shellClass} aria-label={heading}>
      <div className="club-call-journal__head">
        {showHeading ? (
          <div>
            <h2 className={embedded ? 'club-call-journal__title' : 'section-title'}>{heading}</h2>
            {!embedded ? (
              <p className="muted admin-outreach-templates__intro">{lead}</p>
            ) : (
              <p className="muted club-call-journal__intro">{lead}</p>
            )}
          </div>
        ) : (
          <div className="club-call-journal__head-spacer" aria-hidden />
        )}
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
        {showDayControls ? (
          <ClubOutreachDayStepper value={day} onChange={setDay} disabled={loading} />
        ) : null}
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
          {summaryPrefix}: <strong>{summary.total}</strong>
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
          {rows.length === 0 ? emptyDayHint : 'Нет записей с этим фильтром.'}
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
