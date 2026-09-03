import { Link } from 'react-router-dom'
import { Archive, History, Pencil, RotateCcw, Trash2, UserCircle } from 'lucide-react'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { AdminClientClubSmsButton } from './AdminClientClubSmsButton.jsx'
import { AdminClientClubCallButton } from './AdminClientClubCallButton.jsx'
import { AdminClubSmsCampaignRowCheck } from './AdminClubSmsCampaignRowCheck.jsx'
import { AdminClientMaxButton } from './AdminClientMaxButton.jsx'
import { LoyaltyGlanceChip } from '../loyalty/LoyaltyGlanceChip.jsx'
import { AdminDeskAzDeductButton } from './AdminDeskAzDeductButton.jsx'
import { ClientRowMoreMenu } from '../ClientRowMoreMenu.jsx'
import {
  clubSmsMarkChipLabel,
  clubSmsMarkTitle,
} from '../../lib/admin/clubSmsSentMarkCore.js'
import { formatUpcomingBirthdayLabel } from '../../lib/clientBirthdays.js'
import { isBirthdayToday } from '../../lib/trainer/trainerClientOutreachCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { formatInactiveClientListLabel, membershipUsageLabel } from '../../lib/membershipRules.js'
import { filterMembershipsByHall } from '../../lib/membershipHallCore.js'
import { pickExpiredMembershipWithRemaining } from '../../lib/clientListSignals.js'
import {
  formatDeskAzSessionUsageRu,
  pickAzMembershipForDeduct,
} from '../../lib/admin/deskAzSessionDeductCore.js'
import {
  deskAzDirectionLabel,
  formatDeskPackageDurationLabel,
  hallMembershipListSignal,
  inferDeskPackageDuration,
  pickHallActiveMembership,
} from '../../lib/admin/deskMembershipLedgerCore.js'
import {
  buildClientHallStack,
  resolveCrossHallSearchFactHall,
} from '../../lib/admin/adminClientsCrossHallSearchCore.js'
import { buildAdminClientCardHref } from '../../lib/admin/adminClientsListHrefCore.js'
import { clientDeskHall } from '../../lib/admin/deskHallClientsCore.js'
import { isLitePzClient } from '../../lib/admin/trainerTabletModeCore.js'
import { canSalesManagerHardDeleteClient } from '../../lib/admin/salesManagerClientsAccessCore.js'
import { ClientArchiveReasonFact } from '../ClientArchiveReasonFact.jsx'
import { ClientArchiveReasonEditButton } from '../ClientArchiveReasonEditButton.jsx'
import {
  adminClientsCloseHallLabel,
  adminClientsReopenHallLabel,
  resolveAdminClientsActionHall,
  shouldOfferAdminCloseHall,
  shouldOfferAdminReopenHall,
} from '../../lib/admin/adminClientsHallLifecycleMenuCore.js'
import { clientNeedsArchiveReason } from '../../lib/clientArchiveReasonCore.js'
import { AdminClientListAbonFact } from './AdminClientListAbonFact.jsx'
import { AdminClientHallStack } from './AdminClientHallStack.jsx'
import { buildClientCardNavSeed } from '../../lib/admin/clientWorkspaceScopeCore.js'
import { resolveClientListMembershipTypeCode } from '../../lib/admin/clientListMembershipTypeCore.js'
import {
  lastTrainingDateFromMap,
  remainingTrainingsOnMembership,
} from '../../lib/admin/adminClientsListRowHelpers.js'

/**
 * Строка списка клиентов админа / менеджера / управляющего.
 */
export function AdminClientsListRow({
  client: c,
  clientsTab,
  crossHallSearch,
  today,
  memByClient,
  pageTrainings,
  pageTrainingsBusy,
  lastTrainingByClient,
  todaySnapshot,
  quickFilter,
  noTabletTrainerIds,
  smsMode,
  trainerNameById,
  lifecycleRows,
  membershipTypes,
  azMembershipTypes,
  loyaltyGlanceById,
  smsCampaign,
  club,
  clubSmsClubName,
  clubSmsTemplates,
  clubSmsConfigured,
  clubSmsMarkByClient,
  viewingSmsFilter,
  busy,
  onSmsFeedback,
  onClubSmsSent,
  clientsBasePath,
  listNavState,
  cardHrefForClient,
  trainerLabel,
  isSalesManager,
  onOpenCallHistory,
  onArchiveReasonModal,
  onRestoreArchive,
  onConfirmDelete,
  onReloadSilent,
  onToast,
}) {
  const mlistAll = memByClient[c.id] ?? []
  const tabHall =
    clientsTab === 'tz' ? 'tz' : clientsTab === 'az' ? 'az' : clientsTab === 'active' ? 'pz' : null
  const hall = tabHall || clientDeskHall(c)
  const mlist = hall ? filterMembershipsByHall(mlistAll, hall, c) : mlistAll
  const clientTrainings = pageTrainings.filter((t) => t.client_id === c.id)
  const isDeskClient = hall === 'tz' || hall === 'az'
  const isTzDesk = hall === 'tz'
  const active = pickHallActiveMembership(mlistAll, today, hall, c)
  const sig = hallMembershipListSignal(mlistAll, today, hall, c)
  const expiredLeft = active || isTzDesk ? null : pickExpiredMembershipWithRemaining(mlist, today)
  const deskMemForPkg =
    active ||
    (isDeskClient && mlist.length
      ? [...mlist].sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
      : null)
  const deskPkg = deskMemForPkg
    ? formatDeskPackageDurationLabel(
        inferDeskPackageDuration(deskMemForPkg.start_date, deskMemForPkg.end_date),
      )
    : null
  const last = lastTrainingDateFromMap(lastTrainingByClient, c.id, pageTrainingsBusy)
  const inactiveRow = todaySnapshot.inactiveDetailById.get(c.id)
  const inactiveLabel =
    quickFilter === 'inactive' && inactiveRow && clientsTab !== 'tz' && clientsTab !== 'az'
      ? formatInactiveClientListLabel(inactiveRow)
      : ''
  const isLiteRow = isLitePzClient(c, noTabletTrainerIds)
  const birthdayLabel =
    quickFilter === 'birthdays' ? formatUpcomingBirthdayLabel(c.birth_date, today) : null
  const birthdayIsToday = quickFilter === 'birthdays' && isBirthdayToday(c.birth_date, today)
  const rowSmsMode =
    quickFilter === 'birthdays' && !birthdayIsToday
      ? { mode: 'custom', scenario: null, label: 'Свой текст' }
      : smsMode
  const hallStack = crossHallSearch
    ? buildClientHallStack(c, mlistAll, {
        today,
        trainerName: trainerNameById[String(c.trainer_id ?? '')] || '',
        lifecycleRows,
      })
    : []
  const factHall = crossHallSearch ? resolveCrossHallSearchFactHall(hallStack, hall) : hall
  const factMlist = factHall ? filterMembershipsByHall(mlistAll, factHall, c) : mlistAll
  const factActive = pickHallActiveMembership(mlistAll, today, factHall || null, c)
  const factSig = hallMembershipListSignal(mlistAll, today, factHall || null, c)
  const factIsDesk = factHall === 'tz' || factHall === 'az'
  const factExpiredLeft =
    factActive || factHall === 'tz' ? null : pickExpiredMembershipWithRemaining(factMlist, today)
  const azDeductHall = crossHallSearch ? factHall : hall
  const azDeductMem =
    azDeductHall === 'az'
      ? pickAzMembershipForDeduct(filterMembershipsByHall(mlistAll, 'az', c), today) || null
      : null
  const listSig = crossHallSearch ? factSig : sig
  const cardHrefHall = crossHallSearch
    ? factHall || resolveAdminClientsActionHall(clientsTab) || ''
    : ''
  const abonTypeCode = resolveClientListMembershipTypeCode(
    {
      active: factActive,
      expiredLeft: factExpiredLeft,
      memList: factMlist,
      todayIso: today,
    },
    membershipTypes,
  )
  const cardNavSeed = { clientSeed: buildClientCardNavSeed(c) }
  const campaignNoPhone = smsCampaign.active && !smsCampaign.rowSelectable(c)

  return (
    <li className="list-item td-client-item">
      <div className="td-client-card">
        <div className="td-client-card__top">
          {smsCampaign.active ? (
            <AdminClubSmsCampaignRowCheck
              clientId={c.id}
              clientName={formatClientName(c.name) || c.name}
              checked={smsCampaign.isSelected(c.id)}
              disabled={smsCampaign.running}
              noPhone={campaignNoPhone}
              onChange={smsCampaign.toggle}
            />
          ) : null}
          <div className="td-client-card__who">
            <span title={listSig.label} className="td-client-dot" style={{ background: listSig.color }} />
            <div className="td-client-card__who-text">
              <strong className="td-client-card__name">
                {formatClientName(c.name) || c.name}
                {isLiteRow ? (
                  <span
                    className="pnk-badge"
                    style={{ marginLeft: 8 }}
                    title="Тренер без планшета — карточку ведёт админ (карта и абон), не полный дневник"
                  >
                    ведёт админ
                  </span>
                ) : null}
                {String(c.lifecycle ?? '') === 'pnk' ? (
                  <span className="pnk-badge" style={{ marginLeft: 8 }}>
                    ПНК
                  </span>
                ) : null}
                {String(c.lifecycle ?? '') === 'pnk_lost' ? (
                  <span className="pnk-badge pnk-badge--lost" style={{ marginLeft: 8 }}>
                    Отказ
                  </span>
                ) : null}
              </strong>
              <div className="td-client-card__phone">{c.phone ?? '—'}</div>
            </div>
          </div>
          <div className="td-client-card__facts" aria-label="Сводка по клиенту">
            <div className="td-client-fact">
              <span className="td-client-fact__label">Карта</span>
              <span className="td-client-fact__value">{String(c.card_number ?? '').trim() || '—'}</span>
            </div>
            {crossHallSearch ? (
              <>
                {!factIsDesk ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Тренер</span>
                    <span className="td-client-fact__value">{trainerLabel(c.trainer_id)}</span>
                  </div>
                ) : null}
                <AdminClientListAbonFact typeCode={abonTypeCode}>
                  {factIsDesk ? (
                    factActive ? (
                      <>до {formatDateRu(factActive.end_date)}</>
                    ) : (
                      factSig.factLabel || 'нет абонемента'
                    )
                  ) : factActive ? (
                    <>
                      до {formatDateRu(factActive.end_date)}
                      <span className="td-client-fact__sub">
                        {' '}
                        · {membershipUsageLabel(factActive, clientTrainings)}
                      </span>
                    </>
                  ) : factExpiredLeft ? (
                    <>
                      срок {formatDateRu(factExpiredLeft.end_date)}
                      <span className="td-client-fact__sub">
                        {' '}
                        · осталось {remainingTrainingsOnMembership(factExpiredLeft, clientTrainings) ?? '—'}
                      </span>
                    </>
                  ) : (
                    factSig.factLabel || 'нет абонемента'
                  )}
                </AdminClientListAbonFact>
                {!factIsDesk ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Последняя</span>
                    <span className="td-client-fact__value">{last}</span>
                  </div>
                ) : null}
                {!factIsDesk ? <LoyaltyGlanceChip snapshot={loyaltyGlanceById[c.id]} /> : null}
                {birthdayLabel ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">ДР</span>
                    <span className="td-client-fact__value">{birthdayLabel}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {isDeskClient ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Пакет</span>
                    <span className="td-client-fact__value">
                      {deskPkg && deskPkg !== '—' ? deskPkg : '—'}
                    </span>
                  </div>
                ) : (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Тренер</span>
                    <span className="td-client-fact__value">{trainerLabel(c.trainer_id)}</span>
                  </div>
                )}
                {clientsTab === 'az' || hall === 'az' ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Направление</span>
                    <span className="td-client-fact__value">
                      {deskAzDirectionLabel(
                        deskMemForPkg?.membership_type_id ?? active?.membership_type_id,
                        azMembershipTypes,
                      )}
                    </span>
                  </div>
                ) : null}
                {(clientsTab === 'az' || hall === 'az') && (deskMemForPkg || active) ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Занятия</span>
                    <span className="td-client-fact__value">
                      {formatDeskAzSessionUsageRu(deskMemForPkg || active)}
                    </span>
                  </div>
                ) : null}
                <AdminClientListAbonFact typeCode={abonTypeCode}>
                  {isDeskClient ? (
                    active ? (
                      <>до {formatDateRu(active.end_date)}</>
                    ) : (
                      sig.factLabel || 'нет абонемента'
                    )
                  ) : active ? (
                    <>
                      до {formatDateRu(active.end_date)}
                      <span className="td-client-fact__sub">
                        {' '}
                        · {membershipUsageLabel(active, clientTrainings)}
                      </span>
                    </>
                  ) : expiredLeft ? (
                    <>
                      срок {formatDateRu(expiredLeft.end_date)}
                      <span className="td-client-fact__sub">
                        {' '}
                        · осталось {remainingTrainingsOnMembership(expiredLeft, clientTrainings) ?? '—'}
                      </span>
                    </>
                  ) : (
                    sig.factLabel || 'нет абонемента'
                  )}
                </AdminClientListAbonFact>
                {!isDeskClient ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">Последняя</span>
                    <span className="td-client-fact__value">{last}</span>
                  </div>
                ) : null}
                {!isDeskClient ? <LoyaltyGlanceChip snapshot={loyaltyGlanceById[c.id]} /> : null}
                {birthdayLabel ? (
                  <div className="td-client-fact">
                    <span className="td-client-fact__label">ДР</span>
                    <span className="td-client-fact__value">{birthdayLabel}</span>
                  </div>
                ) : null}
              </>
            )}
            {clientsTab === 'archive' ? <ClientArchiveReasonFact client={c} /> : null}
          </div>
          <div className="row td-client-actions">
            <AdminClientMaxButton
              client={c}
              mode={rowSmsMode.mode}
              scenario={rowSmsMode.scenario}
              scenarioLabel={rowSmsMode.label}
              memList={crossHallSearch ? mlistAll : mlist}
              trainerName={trainerNameById[String(c.trainer_id ?? '')] || ''}
              clubName={clubSmsClubName}
              today={today}
              templates={clubSmsTemplates}
              busy={busy}
              onFeedback={onSmsFeedback}
            />
            <AdminClientClubSmsButton
              clubId={club}
              client={c}
              mode={rowSmsMode.mode}
              scenario={rowSmsMode.scenario}
              scenarioLabel={rowSmsMode.label}
              memList={crossHallSearch ? mlistAll : mlist}
              trainerName={trainerNameById[String(c.trainer_id ?? '')] || ''}
              clubName={clubSmsClubName}
              today={today}
              templates={clubSmsTemplates}
              configured={clubSmsConfigured}
              busy={busy}
              sentMarked={clubSmsMarkByClient.has(String(c.id))}
              markChipLabel={clubSmsMarkChipLabel(
                viewingSmsFilter,
                clubSmsMarkByClient.get(String(c.id))?.scenario,
              )}
              markTitle={clubSmsMarkTitle(
                clubSmsMarkByClient.get(String(c.id))?.scenario,
                viewingSmsFilter,
              )}
              onFeedback={onSmsFeedback}
              onSent={onClubSmsSent}
            />
            <AdminClientClubCallButton
              clubId={club}
              client={c}
              clubName={clubSmsClubName}
              configured={clubSmsConfigured}
              busy={busy}
              onFeedback={onSmsFeedback}
            />
            <Link
              to={cardHrefForClient(c.id, cardHrefHall)}
              state={cardNavSeed}
              className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
              aria-label="Карточка клиента"
              title="Карточка клиента"
            >
              <UserCircle size={20} aria-hidden />
            </Link>
            {clientsTab === 'archive' ? (
              <ClientArchiveReasonEditButton
                client={c}
                busy={busy}
                onEdit={(row) => onArchiveReasonModal({ mode: 'edit', client: row })}
              />
            ) : null}
            {clientsTab === 'az' && azDeductMem ? (
              <AdminDeskAzDeductButton
                membership={azDeductMem}
                clientName={formatClientName(c.name) || String(c.name ?? '')}
                compact
                onDone={() => void onReloadSilent()}
                onToast={onToast}
              />
            ) : null}
            <ClientRowMoreMenu
              disabled={busy}
              ariaLabel={`Ещё действия: ${formatClientName(c.name) || c.name || c.id}`}
              items={[
                club
                  ? {
                      id: 'call-history',
                      label: 'История связи',
                      icon: History,
                      onSelect: () => onOpenCallHistory(c),
                    }
                  : null,
                clientsTab !== 'archive' &&
                shouldOfferAdminCloseHall({
                  clientsTab,
                  client: c,
                  memberships: mlistAll,
                  lifecycleRows,
                  asOf: today,
                })
                  ? {
                      id: 'close-hall',
                      label: adminClientsCloseHallLabel(resolveAdminClientsActionHall(clientsTab)),
                      icon: Archive,
                      onSelect: () =>
                        onArchiveReasonModal({
                          mode: 'enter',
                          client: c,
                          action: 'close_hall',
                          hall: resolveAdminClientsActionHall(clientsTab),
                        }),
                    }
                  : null,
                clientsTab !== 'archive' &&
                shouldOfferAdminReopenHall({
                  clientsTab,
                  client: c,
                  memberships: mlistAll,
                  lifecycleRows,
                  asOf: today,
                })
                  ? {
                      id: 'reopen-hall',
                      label: adminClientsReopenHallLabel(resolveAdminClientsActionHall(clientsTab)),
                      icon: RotateCcw,
                      onSelect: () =>
                        void onRestoreArchive(c, resolveAdminClientsActionHall(clientsTab)),
                    }
                  : null,
                clientsTab === 'archive' && c.archived_at
                  ? {
                      id: 'archive-reason',
                      label: clientNeedsArchiveReason(c) ? 'Указать причину' : 'Изменить причину',
                      icon: Pencil,
                      onSelect: () => onArchiveReasonModal({ mode: 'edit', client: c }),
                    }
                  : null,
                clientsTab !== 'archive' || !c.archived_at
                  ? {
                      id: 'leave-club',
                      label: 'Ушёл из клуба',
                      icon: Archive,
                      onSelect: () =>
                        onArchiveReasonModal({
                          mode: 'enter',
                          client: c,
                          action: 'leave_club',
                        }),
                    }
                  : null,
                clientsTab === 'archive' && c.archived_at
                  ? {
                      id: 'restore',
                      label: 'Вернуть в клуб',
                      icon: RotateCcw,
                      onSelect: () => void onRestoreArchive(c),
                    }
                  : null,
                canSalesManagerHardDeleteClient(isSalesManager, c, {
                  memberships: memByClient[c.id] ?? [],
                  lifecycleRows,
                  asOf: today,
                })
                  ? {
                      id: 'delete',
                      label: 'Удалить',
                      icon: Trash2,
                      danger: true,
                      onSelect: () => onConfirmDelete({ id: c.id, name: c.name ?? 'Клиент' }),
                    }
                  : null,
              ].filter(Boolean)}
            />
          </div>
        </div>
        {crossHallSearch ? (
          <AdminClientHallStack
            items={hallStack}
            linkState={cardNavSeed}
            buildHref={(h) =>
              buildAdminClientCardHref(clientsBasePath, c.id, {
                ...listNavState,
                hall: h,
              })
            }
          />
        ) : null}
        {inactiveLabel ? (
          <p className="td-client-card__alert" role="status">
            {inactiveLabel}
          </p>
        ) : null}
      </div>
    </li>
  )
}
