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
import { ClientRowMoreMenu } from '../ClientRowMoreMenu'
import '../../styles/pnk-funnel.css'

export function TrainerClientListItem({
  client,
  rowId = null,
  today,
  memList,
  clientTrainings,
  lastTrainingIso,
  showBirthdayLabel,
  outreachScenario = null,
  outreachHint = null,
  onWriteToMax = null,
  outreachCopied = false,
  outreachBusy = false,
  outreachSent = false,
  highlighted = false,
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

  const maxState = !hasPhone
    ? 'no-phone'
    : outreachCopied
      ? 'copied'
      : outreachSent
        ? 'sent'
        : 'pending'

  const maxTitle =
    maxState === 'no-phone'
      ? 'Нет телефона'
      : maxState === 'copied'
        ? 'Скопировано — открываю Max'
        : maxState === 'sent'
          ? 'Уже отправлено сегодня'
          : client.max_chat_url
            ? 'Max — откроется чат'
            : 'Max — добавьте ссылку на чат в карточке'
  return (
    <li
      id={rowId ?? undefined}
      className={`list-item td-client-item${highlighted ? ' td-client-item--highlight' : ''}`}
    >
      <div className="row td-client-row">
        <div className="td-client-left">
          <span
            title={sig.label}
            className={`td-client-dot td-client-dot--${sig.key === 'expired_remaining' ? 'expired_recent' : sig.key}`}
            aria-label={sig.label}
            role="img"
          />
          <div>
            <strong>
              {client.name}
              {String(client.lifecycle ?? '') === 'pnk' ? (
                <span className="pnk-badge" style={{ marginLeft: 8 }}>
                  ПНК
                </span>
              ) : null}
              {String(client.lifecycle ?? '') === 'pnk_lost' ? (
                <span className="pnk-badge pnk-badge--lost" style={{ marginLeft: 8 }}>
                  Отказ
                </span>
              ) : null}
            </strong>
            <div className="muted td-muted-13">{client.phone ?? '—'}</div>
            <div className="muted td-muted-13">Карта: {String(client.card_number ?? '').trim() || '—'}</div>
          </div>
        </div>
        <div className="row td-client-actions">
          {showOutreach ? (
            <button
              type="button"
              className={`btn btn-icon-square btn-touch trainer-max-btn trainer-max-btn--${maxState}`}
              disabled={!hasPhone || busy || outreachBusy}
              title={maxTitle}
              aria-label={maxTitle}
              aria-pressed={outreachSent || outreachCopied}
              onClick={() => onWriteToMax?.()}
            >
              <MessageCircle size={20} aria-hidden />
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
          <ClientRowMoreMenu
            disabled={busy}
            ariaLabel={`Ещё действия: ${client.name}`}
            items={[
              mode === 'active'
                ? {
                    id: 'archive',
                    label: 'В архив',
                    icon: Archive,
                    onSelect: () => onArchive?.(client),
                  }
                : {
                    id: 'restore',
                    label: 'Вернуть из архива',
                    icon: RotateCcw,
                    onSelect: () => onRestore?.(client),
                  },
              {
                id: 'delete',
                label: 'Удалить',
                icon: Trash2,
                danger: true,
                onSelect: () => onDelete?.(client),
              },
            ]}
          />
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
        {outreachHint ? <span className="trainer-outreach-hint">{outreachHint}</span> : null}
      </div>
    </li>
  )
}
