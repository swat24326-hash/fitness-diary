import { Link } from 'react-router-dom'
import { Archive, Dumbbell, MessageCircle, Pencil, RotateCcw, Trash2, UserCircle } from 'lucide-react'
import { formatUpcomingBirthdayLabel } from '../../lib/clientBirthdays'
import { formatDateRu } from '../../lib/dateRu'
import {
  formatLastTrainingDate,
  membershipSignal,
  membershipSignalDotClass,
  pickExpiredMembershipWithRemaining,
} from '../../lib/clientListSignals'
import {
  canOfferLateMembershipStart,
  canStartNewTrainingForMemberships,
  membershipUsageLabel,
  pickUsableMembershipForDate,
} from '../../lib/membershipRules'
import { clientNeedsArchiveReason } from '../../lib/clientArchiveReasonCore.js'
import { ClientRowMoreMenu } from '../ClientRowMoreMenu'
import { ClientArchiveReasonFact } from '../ClientArchiveReasonFact.jsx'
import { ClientArchiveReasonEditButton } from '../ClientArchiveReasonEditButton.jsx'
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
  onEditArchiveReason,
  onRestore,
}) {
  const active = pickUsableMembershipForDate(memList, today)
  const canStartTraining = canStartNewTrainingForMemberships(memList, today)
  const lateStartOffer = canOfferLateMembershipStart(memList, today, clientTrainings)
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
      <div className="td-client-card">
        <div className="td-client-card__top">
          <div className="td-client-card__who">
            <span
              title={sig.label}
              className={`td-client-dot td-client-dot--${membershipSignalDotClass(sig.key)}`}
              aria-label={sig.label}
              role="img"
            />
            <div className="td-client-card__who-text">
              <strong className="td-client-card__name">
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
              <div className="td-client-card__phone">{client.phone ?? '—'}</div>
            </div>
          </div>
          <div className="td-client-card__facts" aria-label="Сводка по клиенту">
            <div className="td-client-fact">
              <span className="td-client-fact__label">Карта</span>
              <span className="td-client-fact__value">{String(client.card_number ?? '').trim() || '—'}</span>
            </div>
            <div className="td-client-fact">
              <span className="td-client-fact__label">Абонемент</span>
              <span className="td-client-fact__value">
                {mode === 'archive' ? (
                  'архив'
                ) : active ? (
                  <>
                    до {formatDateRu(active.end_date)}
                    <span className="td-client-fact__sub"> · {membershipUsageLabel(active, clientTrainings)}</span>
                  </>
                ) : expiredLeft ? (
                  <>
                    истёк {formatDateRu(expiredLeft.end_date)}
                    <span className="td-client-fact__sub"> · {membershipUsageLabel(expiredLeft, clientTrainings)}</span>
                  </>
                ) : (
                  sig.factLabel || 'нет абонемента'
                )}
              </span>
            </div>
            <div className="td-client-fact">
              <span className="td-client-fact__label">Последняя</span>
              <span className="td-client-fact__value">{last}</span>
            </div>
            {birthdayLabel ? (
              <div className="td-client-fact">
                <span className="td-client-fact__label">День рождения</span>
                <span className="td-client-fact__value">{birthdayLabel}</span>
              </div>
            ) : null}
            {mode === 'archive' ? <ClientArchiveReasonFact client={client} /> : null}
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
              canStartTraining ? (
                <Link
                  to={`/trainer/workouts/new?clientId=${client.id}`}
                  className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                  aria-label="Новая тренировка"
                  title={
                    lateStartOffer
                      ? 'Новая тренировка — можно сдвинуть срок от первой тренировки'
                      : active
                        ? 'Новая тренировка'
                        : 'Начать тренировку — предложим активировать абонемент раньше'
                  }
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
            {mode === 'archive' ? (
              <ClientArchiveReasonEditButton
                client={client}
                busy={busy}
                onEdit={onEditArchiveReason}
              />
            ) : null}
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
                      id: 'archive-reason',
                      label: clientNeedsArchiveReason(client) ? 'Указать причину' : 'Изменить причину',
                      icon: Pencil,
                      onSelect: () => onEditArchiveReason?.(client),
                    },
                mode === 'archive'
                  ? {
                      id: 'restore',
                      label: 'Вернуть из архива',
                      icon: RotateCcw,
                      onSelect: () => onRestore?.(client),
                    }
                  : null,
                {
                  id: 'delete',
                  label: 'Удалить',
                  icon: Trash2,
                  danger: true,
                  onSelect: () => onDelete?.(client),
                },
              ].filter(Boolean)}
            />
          </div>
        </div>
        {outreachHint ? (
          <p className="td-client-card__alert td-client-card__alert--hint" role="status">
            {outreachHint}
          </p>
        ) : null}
      </div>
    </li>
  )
}
