import { useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { AdminClubSmsTemplatesSection } from '../../components/admin/AdminClubSmsTemplatesSection.jsx'
import { AdminClubSmsJournalSection } from '../../components/admin/AdminClubSmsJournalSection.jsx'
import { AdminClubMoizvonkiSection } from '../../components/admin/AdminClubMoizvonkiSection.jsx'
import { AdminOutreachTemplatesSection } from '../../components/admin/AdminOutreachTemplatesSection.jsx'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { useAuth } from '../../context/AuthContext'

export function AdminMaxOutreach() {
  const { user, isSupervisor, supabaseReady } = useAuth()
  const outlet = useOutletContext()
  const [searchParams] = useSearchParams()
  const clubId =
    searchParams.get('club')?.trim() ||
    String(outlet?.clubId ?? '').trim() ||
    (isSupervisor ? String(user?.club_id ?? '').trim() : '')
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
        <p className="admin-outreach-templates__notice muted">Выберите клуб в шапке.</p>
      </div>
    )
  }

  return (
    <div className="admin-outreach-templates">
      <h2 className="section-title td-section-title" style={{ margin: 0 }}>
        Max и SMS
      </h2>
      <AdminClubMoizvonkiSection clubId={clubId} clubName={clubName} />
      <AdminOutreachTemplatesSection clubId={clubId} clubName={clubName} />
      <AdminClubSmsTemplatesSection clubId={clubId} clubName={clubName} />
      <AdminClubSmsJournalSection clubId={clubId} />
    </div>
  )
}
