import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminClubSmsTemplatesSection } from '../../components/admin/AdminClubSmsTemplatesSection.jsx'
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
        <p className="admin-outreach-templates__notice muted">
          Выберите клуб в шапке админки — шаблоны Max и SMS задаются отдельно для каждого клуба.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-outreach-templates">
      <p className="muted admin-outreach-templates__notice">
        Два набора текстов: сообщения тренера в Max и SMS с телефона клуба. Не путайте каналы.
      </p>
      <AdminOutreachTemplatesSection clubId={clubId} clubName={clubName} />
      <AdminClubSmsTemplatesSection clubId={clubId} clubName={clubName} />
    </div>
  )
}
