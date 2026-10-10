import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX2, ChevronRight, MessageCircle, RefreshCw, Users } from 'lucide-react'
import { fetchCoachChats, fetchCoachSchedule } from '../../lib/coach/coachApiClient.js'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'
import { useCoachLoad } from './useCoachLoad.js'

function RefreshButton({ onClick, busy }) {
  return (
    <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={onClick} disabled={busy} aria-label="Обновить" title="Обновить">
      <RefreshCw size={18} aria-hidden className={busy ? 'icon-spin' : undefined} />
    </button>
  )
}

function ScheduleDay({ day }) {
  return (
    <section className="coach-card coach-day" aria-label={day.label}>
      <h2 className="coach-day__title">{day.label}</h2>
      {day.items.length ? (
        <ol className="coach-day__list">
          {day.items.map((it) => (
            <li key={it.id} className={`coach-slot${it.started ? ' coach-slot--started' : ''}`}>
              <time className="coach-slot__time">{it.time}</time>
              <span className="coach-slot__title">{it.title}</span>
              {it.clients > 1 ? (
                <span className="coach-slot__meta" title={`Клиентов: ${it.clients}`}>
                  <Users size={14} aria-hidden /> {it.clients}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="coach-day__empty muted">
          <CalendarX2 size={16} aria-hidden /> Записей нет
        </p>
      )}
    </section>
  )
}

/** «Сегодня»: новые сообщения клиентов и расписание на сегодня и завтра (правится на планшете). */
export function CoachTodayPage() {
  const load = useCallback(async () => {
    const [schedule, chats] = await Promise.all([fetchCoachSchedule(), fetchCoachChats()])
    return { days: schedule.days ?? [], attention: Number(chats.attention) || 0 }
  }, [])
  const { data, status, error, reload } = useCoachLoad(load)

  return (
    <CoachShell actions={<RefreshButton onClick={() => void reload()} busy={status === 'loading'} />}>
      {!data ? (
        <CoachLoadState status={status} error={error} onRetry={() => void reload()} />
      ) : (
        <>
          {data.attention > 0 ? (
            <Link to="/coach/chats" className="coach-card coach-attention">
              <MessageCircle size={20} aria-hidden />
              <span>Новых диалогов: {data.attention}</span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          ) : null}
          {data.days.map((day) => (
            <ScheduleDay key={day.date} day={day} />
          ))}
          <p className="coach-hint muted">Расписание правится на планшете в Ежедневнике.</p>
        </>
      )}
    </CoachShell>
  )
}
