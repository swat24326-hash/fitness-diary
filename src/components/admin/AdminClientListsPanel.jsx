import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import {
  CLIENT_LISTS_CRITERIA,
  CLIENT_LISTS_CRITERION_LABELS,
  CLIENT_LISTS_HALLS,
  CLIENT_LISTS_HALL_LABELS,
  CLIENT_LISTS_POOLS,
  CLIENT_LISTS_POOL_LABELS,
  buildClientListsSearchParams,
  parseClientListsSearchParams,
  queryClientLists,
} from '../../lib/admin/clientListsQueryCore.js'
import { buildAdminClientCardHref } from '../../lib/admin/adminClientsListHrefCore.js'
import { CLIENT_CARD_FROM } from '../../lib/admin/clientCardReturnCore.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { formatUpcomingBirthdayLabel } from '../../lib/clientBirthdays.js'
import { formatDateRu } from '../../lib/dateRu.js'

/**
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   lifecycleRows: object[],
 *   today: string,
 *   clientsBasePath: string,
 *   clubId?: string,
 *   busy?: boolean,
 *   ready?: boolean,
 *   error?: string,
 *   onRefresh?: () => void,
 * }} props
 */
export function AdminClientListsPanel({
  clients,
  memByClient,
  lifecycleRows,
  today,
  clientsBasePath,
  clubId = '',
  busy = false,
  ready = false,
  error = '',
  onRefresh,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = useMemo(() => parseClientListsSearchParams(searchParams), [])
  const [pool, setPool] = useState(initial.pool)
  const [halls, setHalls] = useState(() => [...initial.halls])
  const [criterion, setCriterion] = useState(initial.criterion)
  const [birthdayDays, setBirthdayDays] = useState(initial.birthdayDays)
  const [archiveFrom, setArchiveFrom] = useState(initial.archiveFrom || '')
  const [archiveTo, setArchiveTo] = useState(initial.archiveTo || '')

  const clubFromUrl = String(searchParams.get('club') ?? '').trim()
  const searchKey = searchParams.toString()

  useEffect(() => {
    const next = buildClientListsSearchParams({
      pool,
      halls,
      criterion,
      birthdayDays,
      archiveFrom,
      archiveTo,
    })
    if (clubFromUrl) next.set('club', clubFromUrl)
    const want = next.toString()
    if (searchKey === want) return
    setSearchParams(next, { replace: true })
  }, [
    pool,
    halls,
    criterion,
    birthdayDays,
    archiveFrom,
    archiveTo,
    clubFromUrl,
    searchKey,
    setSearchParams,
  ])

  const result = useMemo(
    () =>
      queryClientLists({
        clients,
        memByClient,
        lifecycleRows,
        query: {
          pool,
          halls,
          criterion,
          birthdayDays,
          archiveFrom,
          archiveTo,
          today,
        },
      }),
    [clients, memByClient, lifecycleRows, pool, halls, criterion, birthdayDays, archiveFrom, archiveTo, today],
  )

  function toggleHall(hall) {
    setHalls((prev) => {
      const has = prev.includes(hall)
      if (has) {
        const next = prev.filter((h) => h !== hall)
        return next.length ? next : [...CLIENT_LISTS_HALLS]
      }
      return CLIENT_LISTS_HALLS.filter((h) => h === hall || prev.includes(h))
    })
  }

  function cardHref(row) {
    const base = buildAdminClientCardHref(clientsBasePath, row.clientId, {
      clubId,
      clientsTab: pool === 'archive' ? 'archive' : row.markerHall === 'pz' ? 'active' : row.markerHall,
      hall: row.markerHall,
    })
    const qs = new URLSearchParams(base.includes('?') ? base.slice(base.indexOf('?') + 1) : '')
    qs.set('from', CLIENT_CARD_FROM.lists)
    const listQs = buildClientListsSearchParams({
      pool,
      halls,
      criterion,
      birthdayDays,
      archiveFrom,
      archiveTo,
    })
    for (const [k, v] of listQs.entries()) qs.set(k, v)
    const path = base.split('?')[0]
    const tail = qs.toString()
    return tail ? `${path}?${tail}` : path
  }

  const showLoading = !ready
  const showRefreshing = ready && busy

  return (
    <div className="admin-client-lists">
      <section className="card admin-client-lists__card">
        <fieldset className="admin-client-lists__section">
          <legend className="admin-client-lists__legend">Кого берём</legend>
          <div className="admin-client-lists__chips" role="group" aria-label="Живые или архив">
            {CLIENT_LISTS_POOLS.map((id) => (
              <button
                key={id}
                type="button"
                className="admin-client-lists__chip btn-touch"
                aria-pressed={pool === id}
                onClick={() => setPool(id)}
              >
                {CLIENT_LISTS_POOL_LABELS[id]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="admin-client-lists__section">
          <legend className="admin-client-lists__legend">Залы</legend>
          <div className="admin-client-lists__chips" role="group" aria-label="Залы списка">
            {CLIENT_LISTS_HALLS.map((id) => (
              <button
                key={id}
                type="button"
                className="admin-client-lists__chip btn-touch"
                aria-pressed={halls.includes(id)}
                onClick={() => toggleHall(id)}
              >
                {CLIENT_LISTS_HALL_LABELS[id]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="admin-client-lists__section">
          <legend className="admin-client-lists__legend">Признак</legend>
          <div className="admin-client-lists__chips" role="group" aria-label="Признак списка">
            {CLIENT_LISTS_CRITERIA.map((id) => (
              <button
                key={id}
                type="button"
                className="admin-client-lists__chip btn-touch"
                aria-pressed={criterion === id}
                onClick={() => setCriterion(id)}
              >
                {CLIENT_LISTS_CRITERION_LABELS[id]}
              </button>
            ))}
          </div>
        </fieldset>

        {criterion === 'birthdays' ? (
          <div className="admin-client-lists__fields">
            <div className="admin-client-lists__field">
              <label htmlFor="client-lists-bday-days">Окно дней рождения</label>
              <select
                id="client-lists-bday-days"
                value={String(birthdayDays)}
                onChange={(e) => setBirthdayDays(Number(e.target.value))}
              >
                <option value="0">Только сегодня</option>
                <option value="7">Ближайшие 7 дней</option>
                <option value="14">Ближайшие 14 дней</option>
                <option value="30">Ближайшие 30 дней</option>
              </select>
            </div>
          </div>
        ) : null}

        {pool === 'archive' ? (
          <div className="admin-client-lists__fields">
            <div className="admin-client-lists__field">
              <label htmlFor="client-lists-arch-from">Архив с</label>
              <input
                id="client-lists-arch-from"
                type="date"
                value={archiveFrom}
                onChange={(e) => setArchiveFrom(e.target.value)}
              />
            </div>
            <div className="admin-client-lists__field">
              <label htmlFor="client-lists-arch-to">Архив по</label>
              <input
                id="client-lists-arch-to"
                type="date"
                value={archiveTo}
                onChange={(e) => setArchiveTo(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="admin-client-lists__actions">
          <p className="admin-client-lists__count">
            Найдено: <span>{ready ? result.count : '…'}</span>
            {showRefreshing ? <span className="admin-client-lists__refreshing"> · обновление…</span> : null}
          </p>
          {typeof onRefresh === 'function' ? (
            <button
              type="button"
              className="btn btn-secondary btn-icon-square btn-touch"
              disabled={busy}
              onClick={() => onRefresh()}
              title="Обновить из облака"
              aria-label="Обновить список из облака"
            >
              <RefreshCw size={18} className={busy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="sync-feedback sync-feedback--warn admin-client-lists__note" role="status">
            {error}
          </p>
        ) : null}
      </section>

      {showLoading ? (
        <p className="admin-client-lists__empty" role="status">
          Загрузка…
        </p>
      ) : result.count === 0 ? (
        <p className="admin-client-lists__empty" role="status">
          Никого не нашлось по выбранным условиям. Смягчите залы или период.
        </p>
      ) : (
        <ul className="admin-client-lists__results">
          {result.rows.map((row) => {
            const c = row.client
            const name = formatClientName(c?.name) || c?.name || 'Без имени'
            let marker = ''
            if (criterion === 'birthdays') {
              marker = formatUpcomingBirthdayLabel(c?.birth_date, today) || ''
            } else if (pool === 'archive' && row.archivedOn) {
              marker = `архив ${formatDateRu(row.archivedOn)}`
            }
            return (
              <li key={row.clientId}>
                <Link to={cardHref(row)} className="admin-client-lists__row os-enter">
                  <div>
                    <div className="admin-client-lists__name">{name}</div>
                    {marker ? <div className="admin-client-lists__meta">{marker}</div> : null}
                  </div>
                  <div className="admin-client-lists__meta">
                    карта {String(c?.card_number ?? '').trim() || '—'}
                  </div>
                  <div className="admin-client-lists__meta">{c?.phone || '—'}</div>
                  <div className="admin-client-lists__halls">
                    {row.halls.map((h) => (
                      <span key={h} className="admin-client-lists__hall-pill">
                        {CLIENT_LISTS_HALL_LABELS[h]}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
