/**
 * Таблица журнала звонков — заголовки колонок + строки.
 */
import { AdminClubCallJournalRow } from './AdminClubCallJournalRow.jsx'

/**
 * @param {{
 *   rows: object[],
 *   mode?: 'club' | 'client',
 *   onNoteSaved?: (logId: string, note: string | null) => void,
 * }} props
 */
export function AdminClubCallJournalTable({ rows, mode = 'club', onNoteSaved }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return null

  const isClub = mode === 'club'
  const colCount = (isClub ? 6 : 5) + 1

  return (
    <div className="club-call-table-wrap">
      <table className={`club-call-table${isClub ? '' : ' club-call-table--client'}`}>
        <thead>
          <tr>
            <th scope="col" className="club-call-table__th club-call-table__th--num">
              №
            </th>
            <th scope="col" className="club-call-table__th club-call-table__th--when">
              Когда
            </th>
            {isClub ? (
              <th scope="col" className="club-call-table__th club-call-table__th--client">
                Клиент
              </th>
            ) : null}
            <th scope="col" className="club-call-table__th club-call-table__th--phone">
              Телефон
            </th>
            <th scope="col" className="club-call-table__th club-call-table__th--status">
              Статус
            </th>
            <th scope="col" className="club-call-table__th club-call-table__th--dur">
              Длит.
            </th>
            <th scope="col" className="club-call-table__th club-call-table__th--extra">
              Доп.
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <AdminClubCallJournalRow
              key={row.id}
              row={row}
              index={index + 1}
              mode={mode}
              colSpan={colCount}
              onNoteSaved={onNoteSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
