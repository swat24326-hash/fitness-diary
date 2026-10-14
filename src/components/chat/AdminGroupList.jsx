import { sortStaffGroups, staffGroupMembersRu } from '../../lib/chat/staffGroupCore.js'
import { StaffGroupRow } from './StaffGroupRow.jsx'

/**
 * Главный админ: чаты всех клубов списком (название клуба вместо «Чат клуба»).
 * @param {{ groups: object[], hrefFor: (clubId: string) => string, selectedId: string }} props
 */
export function AdminGroupList({ groups, hrefFor, selectedId }) {
  if (!groups.length) return <p className="muted chat-contacts__empty">Клубов пока нет</p>
  return (
    <ol className="chat-list" data-testid="admin-groups">
      {sortStaffGroups(groups).map((g) => (
        <StaffGroupRow
          key={g.club_id}
          group={g}
          to={hrefFor(g.club_id)}
          selected={g.club_id === selectedId}
          title={g.last_message_at ? g.name : `${g.name} · ${staffGroupMembersRu(g.members)}`}
        />
      ))}
    </ol>
  )
}
