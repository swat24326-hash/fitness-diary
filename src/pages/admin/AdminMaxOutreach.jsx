import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminOutreachTemplatesSection } from '../../components/admin/AdminOutreachTemplatesSection.jsx'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { useAuth } from '../../context/AuthContext'

export function AdminMaxOutreach() {
  const { supabaseReady } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  const [clubName, setClubName] = useState('—')

  useEffect(() => {
    let alive = true
    const loadClub = async () => {
      try {
        if (supabaseReady) await pullClubsFromSupabase()
        const clubs = await listClubsLocal()
        const hit = clubs.find((c) => String(c.id) === clubId)
        if (alive) setClubName(hit?.name ?? (clubId || '—'))
      } catch {
        if (alive) setClubName(clubId || '—')
      }
    }
    void loadClub()
    return () => {
      alive = false
    }
  }, [clubId, supabaseReady])

  if (!clubId) {
    return (
      <div className="admin-outreach-templates">
        <p className="admin-outreach-templates__notice muted">Выберите клуб в шапке админки — шаблоны задаются отдельно для каждого клуба.</p>
      </div>
    )
  }

  return (
    <div className="admin-outreach-templates">
      <AdminOutreachTemplatesSection clubId={clubId} clubName={clubName} />
    </div>
  )
}
