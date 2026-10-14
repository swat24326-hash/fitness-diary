import { AlertTriangle, CalendarClock, CalendarX2, Eye, Shuffle } from 'lucide-react'
import { HOMEWORK_BLOCK_WEEKS } from '../../lib/homework/auto/homeworkGoalFormulas.js'
import { screeningSummary } from '../../lib/health/healthScreeningCore.js'
import { HealthScreeningBadges } from '../../components/health/HealthScreeningBadges.jsx'
import {
  HOMEWORK_AUTO_HOLD_RU,
  formatHomeworkAutoDay,
  healthLimitsText,
  homeworkAutoHoldReason,
  homeworkAutoNextBlockSunday,
  homeworkAutoWeekOf,
} from '../../lib/homework/auto/homeworkAutoScheduleCore.js'

function WeekDots({ week }) {
  return (
    <span className="homework-auto__weeks" aria-hidden>
      {Array.from({ length: HOMEWORK_BLOCK_WEEKS }, (_, i) => (
        <span key={i} className={`homework-auto__week${i < week ? ' homework-auto__week--done' : ''}`} />
      ))}
    </span>
  )
}

/** «Каждое воскресенье»: включение автоотправки, что уйдёт в ближайшее, пропуск, предпросмотр. */
export function HomeworkAutoScheduleCard({ client, auto, sunday, onEnable, onDisable, onPreview, onShuffle }) {
  const { row, health, screening, lastManualDay, canEdit, save, confirmClearance, error } = auto
  const on = Boolean(row?.enabled)
  const reason = on ? homeworkAutoHoldReason({ row, client, health, screening, sundayIso: sunday, lastManualDay }) : null
  const { week } = on ? homeworkAutoWeekOf(row, sunday) : { week: 1 }
  const day = formatHomeworkAutoDay(sunday)
  const skipped = on && row.skip_date === sunday

  return (
    <div className={`homework-auto__schedule${on ? ' homework-auto__schedule--on' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="homework-auto__schedule-head"
        disabled={!canEdit}
        onClick={on ? onDisable : onEnable}
        aria-label="Отправлять задание каждое воскресенье"
      >
        <CalendarClock size={20} aria-hidden />
        <span className="homework-auto__schedule-title">
          Каждое воскресенье в 10:00
          <span className="homework-auto__schedule-sub">
            {on ? 'Клиент получает неделю занятий в приложении' : 'Задание уйдёт само, вы видите его заранее'}
          </span>
        </span>
        <span className={`client-switch${on ? ' client-switch--on' : ''}`} aria-hidden>
          <span className="client-switch__knob" />
        </span>
      </button>

      {on && reason === 'limits' ? (
        <div className="homework-auto__alert" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <p className="homework-auto__alert-title">Пока не уйдёт: в карточке противопоказания</p>
            {healthLimitsText(health) ? <p className="homework-auto__alert-text">«{healthLimitsText(health)}»</p> : null}
            <p className="homework-auto__alert-text">Отметьте ниже «Нельзя при» — или подтвердите, что для дома ограничений нет.</p>
            <button type="button" className="btn btn-touch homework-auto__limits" onClick={() => save({ limits_ok: true })}>
              Ограничений для дома нет
            </button>
          </div>
        </div>
      ) : null}

      {on && reason === 'clearance' ? (
        <div className="homework-auto__alert" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <p className="homework-auto__alert-title">Пока не уйдёт: нагрузку нужно согласовать</p>
            <HealthScreeningBadges badges={screeningSummary(screening).badges.filter((b) => b.tone === 'danger')} />
            <p className="homework-auto__alert-text">По анкете здоровья нужен допуск. Уточните разрешение врача — задание будет щадящим.</p>
            <button type="button" className="btn btn-touch homework-auto__limits" disabled={!canEdit} onClick={() => void confirmClearance()}>
              Допуск подтверждён
            </button>
          </div>
        </div>
      ) : null}

      {on && reason !== 'limits' && reason !== 'clearance' ? (
        <div className="homework-auto__next">
          {reason ? (
            <p className="homework-auto__next-main homework-auto__next-main--hold">{HOMEWORK_AUTO_HOLD_RU[reason]}</p>
          ) : (
            <p className="homework-auto__next-main">
              Вс {day} · неделя {week} из {HOMEWORK_BLOCK_WEEKS}
              <WeekDots week={week} />
            </p>
          )}
          <p className="muted homework-auto__next-sub">Новый набор упражнений — с {formatHomeworkAutoDay(homeworkAutoNextBlockSunday(row, sunday))}</p>
        </div>
      ) : null}

      {on ? (
        <div className="homework-auto__actions">
          <button type="button" className="btn btn-touch homework-auto__preview" onClick={onPreview}>
            <Eye size={18} aria-hidden />
            Посмотреть неделю
          </button>
          <button
            type="button"
            className={`btn btn-touch btn-ghost${skipped ? ' homework-auto__skip--on' : ''}`}
            aria-pressed={skipped}
            onClick={() => save({ skip_date: skipped ? null : sunday })}
          >
            <CalendarX2 size={18} aria-hidden />
            {skipped ? `Не пропускать ${day}` : `Пропустить ${day}`}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            title="Другой набор упражнений — новый блок с ближайшего воскресенья"
            aria-label="Другой набор упражнений"
            onClick={onShuffle}
          >
            <Shuffle size={18} aria-hidden />
          </button>
        </div>
      ) : null}
      {error ? <p className="homework-auto__error" role="alert">{error}</p> : null}
    </div>
  )
}
