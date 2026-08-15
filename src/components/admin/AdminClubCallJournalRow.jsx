/**
 * Общая строка журнала звонка (команда + исход webhook).
 */
import {
  clubCallJournalStatusLabel,
  clubCallJournalStatusTone,
} from '../../lib/admin/clubCallOutcomeCore.js'
import { formatClubCallDurationSec } from '../../lib/admin/clubCallLogCore.js'
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
 * Подпись статуса без длительности — длительность отдельным чипом справа.
 * @param {object} row
 */
function statusLabelWithoutDuration(row) {
  const full = clubCallJournalStatusLabel(row)
  return String(full).replace(/\s*·\s*\d+\s*с\s*$/i, '').trim() || full
}

/**
 * @param {{
 *   row: object,
 *   mode?: 'club' | 'client',
 *   onNoteSaved?: (logId: string, note: string | null) => void,
 * }} props
 */
export function AdminClubCallJournalRow({ row, mode = 'club', onNoteSaved }) {
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
  const whoMain =
    mode === 'client'
      ? row.sent_by_name
        ? String(row.sent_by_name)
        : 'Кто звонил — не указан'
      : String(row.client_name || 'Клиент').trim() || 'Клиент'
  const whoSub =
    mode === 'client'
      ? null
      : row.sent_by_name
        ? String(row.sent_by_name)
        : null

  return (
    <li className={`club-call-journal__row${fail ? ' club-call-journal__row--fail' : ''}`}>
      <div className="club-call-journal__rail" aria-label="Карточка звонка">
        <time className="club-call-journal__when" dateTime={row.created_at || undefined}>
          {formatDateTimeRu(row.created_at)}
        </time>

        <div className="club-call-journal__person">
          <div className="club-call-journal__who">{whoMain}</div>
        </div>

        <div className="club-call-journal__meta">
          {whoSub ? <div className="club-call-journal__who-sub muted">{whoSub}</div> : null}
          <div className="club-call-journal__phones">
            <span className="club-call-journal__phone">{formatPhone(row.phone)}</span>
            {row.src_number ? (
              <span className="club-call-journal__src muted">SIM {formatPhone(row.src_number)}</span>
            ) : null}
          </div>
        </div>

        <div className="club-call-journal__outcome">
          <span className={statusClass}>{statusLabelWithoutDuration(row)}</span>
          {dur ? <span className="club-call-journal__dur">{dur}</span> : null}
        </div>
      </div>

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
    </li>
  )
}
