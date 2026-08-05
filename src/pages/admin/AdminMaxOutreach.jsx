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
        <p className="admin-outreach-templates__notice muted">
          Выберите клуб в шапке админки — шаблоны Max и SMS задаются отдельно для каждого клуба.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-outreach-templates">
      <p className="muted admin-outreach-templates__notice">
        Max у тренера, Max/SMS у менеджера с доски клиентов, SMS через Мои Звонки с телефона клуба. У каждого
        клуба может быть свой аккаунт Мои Звонки.
      </p>
      <AdminClubMoizvonkiSection clubId={clubId} clubName={clubName} />
      <AdminOutreachTemplatesSection clubId={clubId} clubName={clubName} />
      <AdminClubSmsTemplatesSection clubId={clubId} clubName={clubName} />
      <AdminClubSmsJournalSection clubId={clubId} />
    </div>
  )
}
