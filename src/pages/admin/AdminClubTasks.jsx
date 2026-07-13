import { useSearchParams } from 'react-router-dom'
import { ClubTasksView } from '../shared/ClubTasksView.jsx'

export function AdminClubTasks() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  return <ClubTasksView clubId={clubId} mode="admin" canDelete />
}
