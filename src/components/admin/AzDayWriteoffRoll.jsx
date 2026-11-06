import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Undo2 } from 'lucide-react'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { CLUB_OPS_TIMEZONE, formatDateRu, formatDateTimeRu, todayInTimeZoneIso } from '../../lib/dateRu.js'
import { deskAzDirectionLabel } from '../../lib/admin/deskMembershipLedgerCore.js'

/**
 * Часы клуба из ISO. Пустая строка, если времени нет.
 * @param {string} iso
 */
function clubClock(iso) {
  const raw = String(iso ?? '').trim()
  if (!raw || Number.isNaN(Date.parse(raw))) return ''
  const full = formatDateTimeRu(raw, { timeZone: CLUB_OPS_TIMEZONE })
  const i = full.lastIndexOf(', ')
  const clock = i >= 0 ? full.slice(i + 2) : ''
  return /^\d{2}:\d{2}$/.test(clock) ? clock : ''
}

/**
 * Кого списали за день. Пустой список не рисует блок.
 * На вкладке клиентов чипы направлений выключены: они уже фильтруют список ниже.
 * В отчёте чип сужает только эту перекличку.
 *
 * @param {{
 *   people: Array<{
 *     visitId: string,
 *     membershipId: string,
 *     clientId: string,
 *     clientName: string,
 *     membershipTypeId: string,
 *     createdAt: string,
 *     used: number,
 *     total: number,
 *   }>,
 *   dayIso?: string,
 *   azTypes?: object[],
 *   hrefForClient?: (clientId: string) => string,
 *   enableDirectionFilter?: boolean,
 *   canCancel?: boolean,
 *   onCancel?: (row: object) => Promise<{ ok?: boolean, error?: string, warning?: string | null }>,
 *   matrixLag?: number,
 *   onFillMatrix?: (() => void) | null,
 * }} props
 */
export function AzDayWriteoffRoll({
  people = [],
  dayIso = '',
  azTypes = [],
  hrefForClient,
  enableDirectionFilter = false,
  canCancel = true,
  onCancel,
  matrixLag = 0,
  onFillMatrix = null,
}) {
  const titleId = useId()
  const [dirId, setDirId] = useState('')
  const [armedId, setArmedId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const groups = useMemo(() => {
    /** @type {Map<string, number>} */
    const map = new Map()
    for (const row of people) {
      const id = String(row?.membershipTypeId ?? '').trim()
      if (!id) continue
      map.set(id, (map.get(id) || 0) + 1)
    }
    return [...map.entries()]
      .map(([id, count]) => ({ id, count, label: deskAzDirectionLabel(id, azTypes) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [people, azTypes])

  useEffect(() => {
    if (dirId && !groups.some((g) => g.id === dirId)) setDirId('')
  }, [dirId, groups])

  useEffect(() => {
    if (armedId && !people.some((row) => row.visitId === armedId)) setArmedId('')
  }, [armedId, people])

  if (!people.length) return null

  const day = String(dayIso ?? '').slice(0, 10)
  const isToday = day === todayInTimeZoneIso()
  const title = isToday ? 'Списано сегодня' : `Списано ${formatDateRu(day)}`
  const single = groups.length === 1 ? groups[0] : null
  const showChips = enableDirectionFilter && groups.length > 1
  const showRowDir = !single && !dirId
  const visible = dirId ? people.filter((row) => row.membershipTypeId === dirId) : people
  const lag = Math.max(0, Math.trunc(Number(matrixLag) || 0))
  const showFill = lag > 0 && typeof onFillMatrix === 'function'

  const confirmCancel = async (row) => {
    if (!onCancel || busyId) return
    setBusyId(row.visitId)
    setError('')
    try {
      const res = await onCancel(row)
      if (!res?.ok) {
        setError(res?.error || 'Не удалось отменить списание')
        return
      }
      setArmedId('')
    } catch (e) {
      setError(e?.message || 'Не удалось отменить списание')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="az-day-writeoff" aria-labelledby={titleId}>
      <div className="az-day-writeoff__head">
        <h3 className="az-day-writeoff__title" id={titleId}>
          {title}
          {single && single.label !== '—' ? (
            <span className="az-day-writeoff__title-dir">{single.label}</span>
          ) : null}
          <span className="az-day-writeoff__count">{people.length}</span>
        </h3>
        {showFill ? (
          <div className="az-day-writeoff__fill">
            <p className="az-day-writeoff__lag">В матрице меньше на {lag}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onFillMatrix}
              title="Поднять ячейки до числа списаний. Число, которое уже больше, не уменьшится"
            >
              Довести матрицу
            </button>
          </div>
        ) : null}
      </div>

      {showChips ? (
        <div className="az-day-writeoff__chips" role="group" aria-label="Направление в этом списке">
          <button
            type="button"
            className={`az-day-writeoff__chip${!dirId ? ' is-active' : ''}`}
            aria-pressed={!dirId}
            onClick={() => setDirId('')}
          >
            Все
            <span className="az-day-writeoff__chip-count">{people.length}</span>
          </button>
          {groups.map((g) => {
            const active = dirId === g.id
            return (
              <button
                key={g.id}
                type="button"
                className={`az-day-writeoff__chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setDirId(g.id)}
              >
                {g.label}
                <span className="az-day-writeoff__chip-count">{g.count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <ul
        className="az-day-writeoff__list"
        aria-label={dirId ? `${visible.length} из ${people.length}` : `Списано ${people.length}`}
      >
        {visible.map((row) => {
          const name = formatClientName(row.clientName) || row.clientName || 'Без имени'
          const clock = clubClock(row.createdAt)
          const usage = row.total > 0 ? `${row.used} из ${row.total}` : ''
          const href = hrefForClient?.(row.clientId) || ''
          const dir = deskAzDirectionLabel(row.membershipTypeId, azTypes)
          const armed = armedId === row.visitId
          return (
            <li key={row.visitId} className={`az-day-writeoff__row${armed ? ' is-confirm' : ''}`}>
              {href ? (
                <Link className="az-day-writeoff__name" to={href} title={name}>
                  {name}
                </Link>
              ) : (
                <span className="az-day-writeoff__name" title={name}>
                  {name}
                </span>
              )}
              {armed ? (
                <div className="az-day-writeoff__confirm">
                  <span>Вернуть занятие?</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === row.visitId}
                    onClick={() => void confirmCancel(row)}
                  >
                    {busyId === row.visitId ? 'Возвращаю…' : 'Вернуть'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === row.visitId}
                    onClick={() => setArmedId('')}
                  >
                    Оставить
                  </button>
                </div>
              ) : (
                <>
                  {clock ? <span className="az-day-writeoff__time">{clock}</span> : null}
                  {showRowDir && dir !== '—' ? (
                    <span className="az-day-writeoff__dir" title={dir}>
                      {dir}
                    </span>
                  ) : null}
                  {usage ? (
                    <span className="az-day-writeoff__usage" title={`Списано ${usage}`}>
                      {usage}
                    </span>
                  ) : null}
                  {canCancel && onCancel && row.membershipId ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon-square az-day-writeoff__undo"
                      aria-label={`Отменить списание: ${name}`}
                      title={`Отменить списание: ${name}`}
                      onClick={() => {
                        setError('')
                        setArmedId(row.visitId)
                      }}
                    >
                      <Undo2 size={16} aria-hidden />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error ? <p className="az-day-writeoff__error">{error}</p> : null}
    </section>
  )
}
