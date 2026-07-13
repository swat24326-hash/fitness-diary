import { useAuth } from '../../context/AuthContext'
import { ClubTasksView } from '../shared/ClubTasksView.jsx'

export function SalesClubTasks() {
  const { user } = useAuth()
  const clubId = String(user?.club_id ?? '').trim()
  return <ClubTasksView clubId={clubId} mode="sales" canDelete={false} />
}
