import { UserCircle, Users } from 'lucide-react'
import {
  INBOX_HALL_LABELS,
  INBOX_STAFF_ROLE_LABELS,
  inboxAudienceLineRu,
  inboxStaffRoleChoices,
  inboxTriggerReachRu,
} from '../../lib/inbox/inboxAdminUiCore.js'

function toggle(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

function Chip({ on, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={`admin-inbox__chip${on ? ' admin-inbox__chip--on' : ''}`}
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

/**
 * «Кому»: клиенты (клуб + зал) или команда (клуб + роли) и охват до отправки.
 * Автоопрос (autoTrigger): залы не выбираем — рубеж по тренировкам, охват — правило вместо числа.
 * @param {{ draft: object, set: (patch: object) => void, clubs: object[], clubIds: string[], isSupervisor: boolean, disabled: boolean, reach: { audience: object|null, busy: boolean, error: string }, autoTrigger?: string|null }} props
 */
export function AdminInboxAudience({ draft, set, clubs, clubIds, isSupervisor, disabled, reach, autoTrigger = null }) {
  const staff = draft.audience === 'staff'
  const reachLine = !clubIds.length
    ? 'Выберите клуб'
    : autoTrigger
      ? inboxTriggerReachRu(autoTrigger)
      : staff && !draft.staff_roles.length
      ? 'Отметьте, кому из команды'
      : reach.busy
        ? 'Считаю получателей…'
        : reach.error || inboxAudienceLineRu(reach.audience, draft.audience)

  return (
    <div className="field">
      <span className="label">Кому</span>
      <div className="admin-inbox__segment" role="radiogroup" aria-label="Получатели">
        {[
          ['clients', UserCircle, 'Клиентам'],
          ['staff', Users, 'Команде'],
        ].map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={draft.audience === key}
            className={`admin-inbox__segment-btn${draft.audience === key ? ' admin-inbox__segment-btn--on' : ''}`}
            onClick={() => set({ audience: key })}
            disabled={disabled}
          >
            <Icon size={18} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {isSupervisor ? (
        <p className="admin-inbox__fixed">Клуб {clubs[0]?.name || ''}</p>
      ) : (
        <div className="admin-inbox__chips" role="group" aria-label="Клубы">
          {clubs.map((c) => (
            <Chip key={c.id} on={draft.club_ids.includes(c.id)} onClick={() => set({ club_ids: toggle(draft.club_ids, c.id) })} disabled={disabled}>
              {c.name || 'Без названия'}
            </Chip>
          ))}
        </div>
      )}

      {staff ? (
        <div className="admin-inbox__chips" role="group" aria-label="Роли">
          {inboxStaffRoleChoices(isSupervisor).map((r) => (
            <Chip key={r} on={draft.staff_roles.includes(r)} onClick={() => set({ staff_roles: toggle(draft.staff_roles, r) })} disabled={disabled}>
              {INBOX_STAFF_ROLE_LABELS[r]}
            </Chip>
          ))}
        </div>
      ) : autoTrigger ? null : (
        <div className="admin-inbox__chips" role="group" aria-label="Залы">
          <Chip on={!draft.halls.length} onClick={() => set({ halls: [] })} disabled={disabled}>
            Все залы
          </Chip>
          {Object.entries(INBOX_HALL_LABELS).map(([h, label]) => (
            <Chip key={h} on={draft.halls.includes(h)} onClick={() => set({ halls: toggle(draft.halls, h) })} disabled={disabled}>
              {label}
            </Chip>
          ))}
        </div>
      )}

      <p className="admin-inbox__audience" role="status">
        <Users size={16} aria-hidden />
        {reachLine}
      </p>
    </div>
  )
}
