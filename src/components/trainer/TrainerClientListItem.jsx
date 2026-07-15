import { Link } from 'react-router-dom'
import { Archive, Dumbbell, MessageCircle, RotateCcw, Trash2, UserCircle } from 'lucide-react'
import { formatUpcomingBirthdayLabel } from '../../lib/clientBirthdays'
import { formatDateRu } from '../../lib/dateRu'
import {
  formatLastTrainingDate,
  membershipSignal,
  pickExpiredMembershipWithRemaining,
} from '../../lib/clientListSignals'
import { membershipUsageLabel, pickUsableMembershipForDate } from '../../lib/membershipRules'

export function TrainerClientListItem({
  client,
  today,
  memList,
  clientTrainings,
  lastTrainingIso,
  showBirthdayLabel,
  outreachScenario = null,
  onWriteToMax = null,
  outreachCopied = false,
  outreachBusy = false,
  mode = 'active',
  busy,
  onDelete,
  onArchive,
  onRestore,
}) {
  const active = pickUsableMembershipForDate(memList, today)
  const sig = membershipSignal(memList, today)
  const expiredLeft = active ? null : pickExpiredMembershipWithRemaining(memList, today)
  const last = formatLastTrainingDate(lastTrainingIso)
  const birthdayLabel = showBirthdayLabel ? formatUpcomingBirthdayLabel(client.birth_date, today) : null
  const hasPhone = Boolean(String(client.phone ?? '').trim())
  const showOutreach = Boolean(outreachScenario && onWriteToMax)

  return (
    <li className="list-item td-client-item">
      <div className="row td-client-row">
        <div className="td-client-left">
          <span
            title={sig.label}
            className={`td-client-dot td-client-dot--${sig.key === 'expired_remaining' ? 'expired_recent' : sig.key}`}
            aria-label={sig.label}
            role="img"
          />
          <div>
            <strong>{client.name}</strong>
            <div className="muted td-muted-13">{client.phone ?? '—'}</div>
            <div className="muted td-muted-13">Карта: {String(client.card_number ?? '').trim() || '—'}</div>
          </div>
        </div>
        <div className="row td-client-actions">
          {showOutreach ? (
            <button
              type="button"
              className={`btn btn-touch trainer-outreach-btn${outreachCopied ? ' trainer-outreach-btn--copied' : ''}`}
              disabled={!hasPhone || busy || outreachBusy}
              title={hasPhone ? 'Скопировать текст и открыть Max' : 'Нет номера телефона'}
              aria-label={hasPhone ? 'Написать в Max' : 'Нет номера телефона'}
              onClick={() => onWriteToMax?.()}
            >
              <MessageCircle size={18} aria-hidden />
              <span className="trainer-outreach-btn__label">
                {outreachCopied ? 'Текст скопирован! Открываю Max…' : 'Написать в Max'}
              </span>
            </button>
          ) : null}
          {mode === 'active' ? (
            active ? (
              <Link
                to={`/trainer/workouts/new?clientId=${client.id}`}
                className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                aria-label="Новая тренировка"
                title="Новая тренировка"
              >
                <Dumbbell size={20} aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch u-opacity-55 u-pointer-auto"
                aria-disabled="true"
                aria-label="Новая тренировка"
                title="Нет действующего абонемента"
                onClick={() => alert('Нет действующего абонемента')}
              >
                <Dumbbell size={20} aria-hidden />
              </button>
            )
          ) : null}
          <Link
            to={`/trainer/clients/${client.id}`}
            className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
            aria-label="Карточка клиента"
            title="Карточка клиента"
          >
            <UserCircle size={20} aria-hidden />
          </Link>
          {mode === 'active' ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch"
              disabled={busy}
              aria-label={`В архив: ${client.name}`}
              title="В архив"
              onClick={() => onArchive?.(client)}
            >
              <Archive size={20} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch"
              disabled={busy}
              aria-label={`Вернуть из архива: ${client.name}`}
              title="Вернуть"
              onClick={() => onRestore?.(client)}
            >
              <RotateCcw size={20} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch td-client-delete"
            disabled={busy}
            aria-label={`Удалить клиента ${client.name}`}
            title="Удалить клиента"
            onClick={() => onDelete(client)}
          >
            <Trash2 size={20} aria-hidden />
          </button>
        </div>
      </div>
      <div className="muted td-muted-row">
        {mode === 'archive' ? (
          <span title="Архивный клиент — действия доступны после «Вернуть»">Архив</span>
        ) : null}
        {active ? (
          <>
            <span>
              Абонемент до <strong>{formatDateRu(active.end_date)}</strong>
            </span>
            <span>
              Использовано: <strong>{membershipUsageLabel(active, clientTrainings)}</strong>
            </span>
          </>
        ) : expiredLeft ? (
          <>
            <span>
              Срок истёк <strong>{formatDateRu(expiredLeft.end_date)}</strong>
            </span>
            <span>
              Использовано: <strong>{membershipUsageLabel(expiredLeft, clientTrainings)}</strong>
            </span>
          </>
        ) : (
          <span>Абонемент: нет активного</span>
        )}
        <span>
          Последняя тренировка: <strong>{last}</strong>
        </span>
        {birthdayLabel ? (
          <span>
            День рождения: <strong>{birthdayLabel}</strong>
          </span>
        ) : null}
      </div>
    </li>
  )
}
