import { NavLink, useSearchParams } from 'react-router-dom'
import { AlertTriangle, LogOut, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { resolveClubDisplayName } from '../lib/dataAccess'
import {
  computeNeedsUserAttention,
  getPersistentErrorCount,
  initSyncAttentionFromJournal,
  subscribeSyncAttention,
} from '../lib/appErrorJournal'
import { AppErrorJournalModal } from './AppErrorJournalModal'
import '../styles/sales-report.css'

function navClass({ isActive }) {
  return `sales-header__nav-link${isActive ? ' sales-header__nav-link--active' : ''}`
}

export function SalesHeader() {
  const { user, signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const [clubLabel, setClubLabel] = useState('—')
  const [errorJournalOpen, setErrorJournalOpen] = useState(false)
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const [needsAttention, setNeedsAttention] = useState(false)

  const clubId = String(user?.club_id ?? '').trim()
  const statsActive = searchParams.get('tab') === 'stats'

  useEffect(() => {
    if (!clubId) {
      setClubLabel('—')
      return
    }
    let alive = true
    void resolveClubDisplayName(clubId).then((name) => {
      if (alive) setClubLabel(name || clubId)
    })
    return () => {
      alive = false
    }
  }, [clubId])

  const refreshAttention = useCallback(() => {
    setPersistentErrorCount(getPersistentErrorCount())
    setNeedsAttention(computeNeedsUserAttention(0))
  }, [])

  useEffect(() => {
    initSyncAttentionFromJournal()
    return subscribeSyncAttention(refreshAttention)
  }, [refreshAttention])

  return (
    <>
      <header className="sales-header app-header">
        <div className="sales-header__inner">
          <div className="sales-header__brand">
            <TrendingUp size={22} aria-hidden className="sales-header__brand-icon" />
            <div>
              <span className="sales-header__title">Продажи</span>
              {clubId ? (
                <span className="sales-header__club" title="Ваш клуб">
                  {clubLabel}
                </span>
              ) : null}
            </div>
          </div>

          <nav className="sales-header__nav" aria-label="Разделы продаж">
            <NavLink to="/sales" end className={navClass}>
              Отчёт за день
            </NavLink>
            <NavLink to="/sales?tab=stats" className={({ isActive }) => navClass({ isActive: isActive || statsActive })}>
              Статистика
            </NavLink>
          </nav>

          <div className="sales-header__actions">
            <button
              type="button"
              className={`btn btn-ghost btn-sm sales-header__journal${needsAttention ? ' sales-header__journal--alert' : ''}`}
              onClick={() => setErrorJournalOpen(true)}
              aria-label="Журнал ошибок"
              title="Журнал ошибок"
            >
              <AlertTriangle size={18} aria-hidden />
              {persistentErrorCount > 0 ? <span className="sales-header__badge">{persistentErrorCount}</span> : null}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()} title="Выйти">
              <LogOut size={18} aria-hidden />
              <span className="sales-header__logout-label">Выйти</span>
            </button>
          </div>
        </div>
      </header>
      <AppErrorJournalModal open={errorJournalOpen} onClose={() => setErrorJournalOpen(false)} />
    </>
  )
}
