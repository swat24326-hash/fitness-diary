/**
 * Общая строка журнала звонка (команда + исход webhook).
 */
import {
  clubCallJournalStatusLabel,
  clubCallJournalStatusTone,
} from '../../lib/admin/clubCallOutcomeCore.js'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { AdminClubCallRecordingPlayer } from './AdminClubCallRecordingPlayer.jsx'

function formatPhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  return phone || '—'
}

/**
 * @param {{ row: object, mode?: 'club' | 'client' }} props
 */
export function AdminClubCallJournalRow({ row, mode = 'club' }) {
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

  const who =
    mode === 'client'
      ? row.sent_by_name
        ? `Кто: ${row.sent_by_name}`
        : 'Кто: —'
      : `${row.client_name || 'Клиент'}${row.sent_by_name ? ` · ${row.sent_by_name}` : ''}`

  return (
    <li className={`club-call-journal__row${fail ? ' club-call-journal__row--fail' : ''}`}>
      <div className="club-call-journal__meta">
        <span className="club-call-journal__when">{formatDateTimeRu(row.created_at)}</span>
        <span className={statusClass}>{clubCallJournalStatusLabel(row)}</span>
      </div>
      <div className="club-call-journal__who">{who}</div>
      <div className="club-call-journal__phone muted">{formatPhone(row.phone)}</div>
      {row.src_number ? (
        <p className="muted club-call-journal__src">с SIM {formatPhone(row.src_number)}</p>
      ) : null}
      {row.recording_url ? <AdminClubCallRecordingPlayer url={row.recording_url} /> : null}
      {fail && row.error_message ? (
        <p className="club-call-journal__error">{row.error_message}</p>
      ) : null}
    </li>
  )
}
