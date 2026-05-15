import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { LOCAL_DATA_CHANGED } from '../lib/dataAccess'
import { getDb } from '../lib/localDb'
import { formatDateRu } from '../lib/dateRu'

function surnameOnly(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return 'Клиент'
  return s.split(' ')[0]
}

export function DraftTabsBar() {
  const { user, isAdmin } = useAuth()
  const loc = useLocation()
  const [drafts, setDrafts] = useState([])
  const [clientById, setClientById] = useState({})

  const adminClubId = useMemo(() => {
    if (!isAdmin) return ''
    try {
      return new URLSearchParams(loc.search ?? '').get('club') ?? ''
    } catch {
      return ''
    }
  }, [isAdmin, loc.search])

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!user?.id) return
      try {
        const db = await getDb()
        const [allTrainings, allClients] = await Promise.all([db.getAll('trainings'), db.getAll('clients')])
        if (!alive) return
        const cmap = {}
        for (const c of allClients) cmap[c.id] = c
        setClientById(cmap)
        const draftRows = allTrainings
          .filter((t) => t.status === 'draft')
          .filter((t) => (isAdmin ? (adminClubId ? t.club_id === adminClubId : false) : t.trainer_id === user.id))
          .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
        const capped = isAdmin ? draftRows.slice(0, 25) : draftRows
        setDrafts(capped)
      } catch {
        if (!alive) return
        setDrafts([])
        setClientById({})
      }
    }
    run()
    const onStorage = () => {
      run()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onStorage)
    return () => {
      alive = false
      window.removeEventListener(LOCAL_DATA_CHANGED, onStorage)
    }
  }, [user?.id, isAdmin, adminClubId, loc.pathname])

  const activeId = useMemo(() => {
    const m = String(loc.pathname ?? '').match(/\/(?:trainer|admin)\/workouts\/([^/]+)$/)
    return m?.[1] ?? null
  }, [loc.pathname])

  if (!user?.id || drafts.length === 0) return null

  const workoutBase = isAdmin ? '/admin/workouts' : '/trainer/workouts'

  return (
    <div className="draft-tabs-shell" role="region" aria-label={isAdmin ? 'Черновики клуба' : 'Черновики тренера'}>
      <div className="draft-tabs">
        {drafts.map((t) => {
          const c = clientById[t.client_id]
          const label = surnameOnly(c?.name) ?? 'Клиент'
          const isActive = activeId === t.id
          return (
            <Link
              key={t.id}
              to={`${workoutBase}/${t.id}`}
              className={`draft-tab${isActive ? ' draft-tab--active' : ''}`}
              title={`Черновик · ${label} · ${formatDateRu(t.date)}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <FileText size={14} aria-hidden />
              <span className="draft-tab__text">{label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

