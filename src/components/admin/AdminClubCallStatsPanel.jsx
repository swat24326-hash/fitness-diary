/**
 * Плотная сводка звонков за день: герой-цифры + исходы + сотрудники.
 */
import { CLUB_CALL_UI_LABEL } from '../../lib/admin/clubCallOutcomeCore.js'
import { formatClubCallDurationSec } from '../../lib/admin/clubCallLogCore.js'
import '../../styles/club-call.css'

/**
 * @param {{
 *   stats: {
 *     total: number,
 *     answered: number,
 *     missed: number,
 *     short: number,
 *     pending: number,
 *     fail: number,
 *     unsuccessful: number,
 *     finished: number,
 *     connect_rate_pct: number | null,
 *     unique_clients: number,
 *     clients_repeat: number,
 *     talk_sec_total: number,
 *     talk_sec_avg: number | null,
 *     by_sender: Array<{
 *       key: string,
 *       name: string,
 *       total: number,
 *       answered: number,
 *       missed: number,
 *       short: number,
 *       pending: number,
 *       fail: number,
 *     }>,
 *   } | null,
 *   loading?: boolean,
 *   emptyHint?: string,
 * }} props
 */
export function AdminClubCallStatsPanel({
  stats,
  loading = false,
  emptyHint = 'Нет звонков за этот день.',
}) {
  if (loading) {
    return <p className="muted">Считаем сводку…</p>
  }
  if (!stats || stats.total === 0) {
    return <p className="muted club-call-stats__empty">{emptyHint}</p>
  }

  const talkTotal = formatClubCallDurationSec(stats.talk_sec_total) || '0:00'
  const talkAvg = stats.talk_sec_avg != null ? formatClubCallDurationSec(stats.talk_sec_avg) : null
  const rate = stats.connect_rate_pct != null ? `${stats.connect_rate_pct}%` : '—'

  const outcomes = [
    { id: 'answered', n: stats.answered, label: CLUB_CALL_UI_LABEL.answered, tone: 'answered' },
    { id: 'missed', n: stats.missed, label: CLUB_CALL_UI_LABEL.missed, tone: 'missed' },
    { id: 'short', n: stats.short, label: CLUB_CALL_UI_LABEL.short, tone: 'short' },
    { id: 'pending', n: stats.pending, label: CLUB_CALL_UI_LABEL.pending, tone: 'pending' },
    { id: 'fail', n: stats.fail, label: CLUB_CALL_UI_LABEL.fail, tone: 'fail' },
  ]

  const inboundN = Number(stats.inbound_total) || 0

  return (
    <div className="club-call-stats club-call-stats--dense">
      <div className="club-call-stats__hero" role="group" aria-label="Итоги дня">
        <div className="club-call-stats__hero-cell">
          <span className="club-call-stats__hero-val">{stats.total}</span>
          <span className="club-call-stats__hero-lab">
            звонков
            {inboundN > 0 ? (
              <span className="club-call-stats__hero-sub">
                {' '}
                · {inboundN} вх. / {Number(stats.outbound_total) || 0} исх.
              </span>
            ) : null}
          </span>
        </div>
        <div className="club-call-stats__hero-cell">
          <span className="club-call-stats__hero-val">{stats.unique_clients}</span>
          <span className="club-call-stats__hero-lab">
            клиентов
            {stats.clients_repeat > 0 ? (
              <span className="club-call-stats__hero-sub"> · {stats.clients_repeat} повторно</span>
            ) : null}
          </span>
        </div>
        <div className="club-call-stats__hero-cell club-call-stats__hero-cell--accent">
          <span className="club-call-stats__hero-val">{rate}</span>
          <span className="club-call-stats__hero-lab">
            дозвона
            {stats.unsuccessful > 0 ? (
              <span className="club-call-stats__hero-sub"> · {stats.unsuccessful} без ответа</span>
            ) : null}
          </span>
        </div>
        <div className="club-call-stats__hero-cell">
          <span className="club-call-stats__hero-val">{talkTotal}</span>
          <span className="club-call-stats__hero-lab">
            в эфире
            {talkAvg ? <span className="club-call-stats__hero-sub"> · ср. {talkAvg}</span> : null}
          </span>
        </div>
      </div>

      <ul className="club-call-stats__strip" aria-label="Исходы">
        {outcomes.map((o) => (
          <li
            key={o.id}
            className={`club-call-stats__chip club-call-stats__chip--${o.tone}${o.n === 0 ? ' club-call-stats__chip--zero' : ''}`}
          >
            <strong>{o.n}</strong>
            <span>{o.label}</span>
          </li>
        ))}
      </ul>

      {inboundN > 0 ? (
        <ul className="club-call-stats__strip" aria-label="Входящие">
          <li className="club-call-stats__chip club-call-stats__chip--inbound">
            <strong>{inboundN}</strong>
            <span>входящих</span>
          </li>
          <li className="club-call-stats__chip club-call-stats__chip--answered">
            <strong>{Number(stats.inbound_answered) || 0}</strong>
            <span>ответили</span>
          </li>
          <li
            className={`club-call-stats__chip club-call-stats__chip--missed${
              (Number(stats.inbound_missed) || 0) === 0 ? ' club-call-stats__chip--zero' : ''
            }`}
          >
            <strong>{Number(stats.inbound_missed) || 0}</strong>
            <span>пропущено</span>
          </li>
        </ul>
      ) : null}

      {stats.by_sender.length > 0 ? (
        <section className="club-call-stats__staff" aria-label="По сотрудникам">
          <h3 className="club-call-stats__h club-call-stats__h--tight">Кто звонил</h3>
          <ul className="club-call-stats__table">
            {stats.by_sender.map((row) => {
              const parts = [
                row.answered ? `${CLUB_CALL_UI_LABEL.answered} ${row.answered}` : null,
                row.missed ? `${CLUB_CALL_UI_LABEL.missed} ${row.missed}` : null,
                row.short ? `${CLUB_CALL_UI_LABEL.short} ${row.short}` : null,
                row.pending ? `${CLUB_CALL_UI_LABEL.pending} ${row.pending}` : null,
                row.fail ? `${CLUB_CALL_UI_LABEL.fail} ${row.fail}` : null,
              ].filter(Boolean)
              return (
                <li key={row.key || row.name} className="club-call-stats__row club-call-stats__row--staff">
                  <div className="club-call-stats__staff-head">
                    <span className="club-call-stats__row-name">{row.name}</span>
                    <span className="club-call-stats__row-total">{row.total}</span>
                  </div>
                  {parts.length ? (
                    <span className="club-call-stats__row-nums muted">{parts.join(' · ')}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
