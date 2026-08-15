/**
 * Строка таблицы журнала звонка (+ деталь: запись / пометка).
 */
import {
  clubCallJournalStatusLabel,
  clubCallJournalStatusTone,
  CLUB_CALL_UI_LABEL,
} from '../../lib/admin/clubCallOutcomeCore.js'
import { formatClubCallDurationSec } from '../../lib/admin/clubCallLogCore.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { AdminClubCallRecordingPlayer } from './AdminClubCallRecordingPlayer.jsx'
import { AdminClubCallJournalNote } from './AdminClubCallJournalNote.jsx'

function formatPhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  return phone || '—'
}

/**
 * Фамилия отдельно, имя+отчество — второй строкой.
 * @param {string} raw
 * @returns {{ surname: string, given: string }}
 */
function splitClientDisplayName(raw) {
  const full = formatClientName(raw) || String(raw ?? '').trim() || 'Клиент'
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { surname: full, given: '' }
  return { surname: parts[0], given: parts.slice(1).join(' ') }
}

/**
 * @param {object} row
 */
function statusLabelWithoutDuration(row) {
  const full = clubCallJournalStatusLabel(row)
  return String(full).replace(/\s*·\s*\d+\s*с\s*$/i, '').trim() || full
}

/**
 * @param {{
 *   row: object,
 *   index?: number,
 *   mode?: 'club' | 'client',
 *   colSpan?: number,
 *   onNoteSaved?: (logId: string, note: string | null) => void,
 * }} props
 */
export function AdminClubCallJournalRow({ row, index = 0, mode = 'club', colSpan = 7, onNoteSaved }) {
  const fail = String(row.status ?? 'ok') === 'fail'
  const tone = clubCallJournalStatusTone(row)
  const statusClass = [
    'club-call-journal__status',
    fail || tone === 'fail' ? 'club-call-journal__status--fail' : '',
    tone === 'answered' ? 'club-call-journal__status--answered' : '',
    tone === 'short' ? 'club-call-journal__status--short' : '',
    tone === 'missed' ? 'club-call-journal__status--missed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const dur = formatClubCallDurationSec(row.duration_sec)
  const isClub = mode === 'club'
  const { surname, given } = splitClientDisplayName(
    row.client_name || (row.client_id ? 'Клиент' : 'Неизвестный'),
  )
  const staffName = row.sent_by_name ? String(row.sent_by_name).trim() : ''
  const sim = row.src_number ? formatPhone(row.src_number) : ''
  const hasExtra = Boolean(staffName || sim)
  const hasDetail = Boolean(row.recording_url || (row.club_id && row.id) || (fail && row.error_message))

  return (
    <>
      <tr className={`club-call-table__data${fail ? ' club-call-table__data--fail' : ''}`}>
        <td className="club-call-table__td club-call-table__td--num">
          <span className="club-call-table__num">{index > 0 ? index : '—'}</span>
        </td>
        <td className="club-call-table__td club-call-table__td--when">
          <time dateTime={row.created_at || undefined}>{formatDateTimeRu(row.created_at)}</time>
        </td>
        {isClub ? (
          <td className="club-call-table__td club-call-table__td--client">
            <span className="club-call-table__name">
              <span className="club-call-table__surname">{surname}</span>
              {given ? <span className="club-call-table__given">{given}</span> : null}
            </span>
          </td>
        ) : null}
        <td className="club-call-table__td club-call-table__td--phone">
          <span className="club-call-table__phone">{formatPhone(row.phone)}</span>
        </td>
        <td className="club-call-table__td club-call-table__td--status">
          <div className="club-call-table__status-wrap">
            {String(row.direction ?? '') === 'inbound' ? (
              <span className="club-call-table__dir club-call-table__dir--in">{CLUB_CALL_UI_LABEL.inbound}</span>
            ) : null}
            <span className={statusClass}>{statusLabelWithoutDuration(row)}</span>
          </div>
        </td>
        <td className="club-call-table__td club-call-table__td--dur">
          {dur ? <span className="club-call-journal__dur">{dur}</span> : <span className="muted">—</span>}
        </td>
        <td className="club-call-table__td club-call-table__td--extra">
          {hasExtra ? (
            <div className="club-call-table__extra">
              {staffName ? <span className="club-call-table__extra-staff">{staffName}</span> : null}
              {sim ? <span className="club-call-table__extra-sim">SIM {sim}</span> : null}
            </div>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      </tr>

      {hasDetail ? (
        <tr className={`club-call-table__detail${fail ? ' club-call-table__detail--fail' : ''}`}>
          <td colSpan={colSpan}>
            {fail && row.error_message ? (
              <p className="club-call-journal__error">{row.error_message}</p>
            ) : null}
            {row.recording_url || (row.club_id && row.id) ? (
              <div
                className={`club-call-journal__tools${row.recording_url ? '' : ' club-call-journal__tools--note-only'}`}
              >
                {row.recording_url ? (
                  <div className="club-call-journal__media">
                    <AdminClubCallRecordingPlayer url={row.recording_url} />
                  </div>
                ) : null}
                {row.club_id && row.id ? (
                  <div className="club-call-journal__note-slot">
                    <AdminClubCallJournalNote
                      clubId={String(row.club_id)}
                      logId={String(row.id)}
                      note={row.staff_note}
                      compact={mode === 'client'}
                      onSaved={(next) => onNoteSaved?.(String(row.id), next)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  )
}
