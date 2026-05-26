import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { clearPoisonedSyncQueue } from './lib/syncService'
import { initTrainerWorkspaceCacheInvalidation } from './lib/trainerWorkspaceCache'
import { AppHeader } from './components/AppHeader'
import { DraftTabsBar } from './components/DraftTabsBar'
import { BreadcrumbsBar } from './components/BreadcrumbsBar'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminClients } from './pages/admin/AdminClients'
import { AdminExercises } from './pages/admin/AdminExercises'
import { AdminStructure } from './pages/admin/AdminStructure'
import { AdminChallenges } from './pages/admin/AdminChallenges'
import { AdminChallengeDetail } from './pages/admin/AdminChallengeDetail'
import { AdminDiagnostics } from './pages/admin/AdminDiagnostics'
import { Login } from './pages/Login'
import { ClientCard } from './pages/trainer/ClientCard'
import { TrainerHome } from './pages/trainer/TrainerHome'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { TrainerChallengeDetail } from './pages/trainer/TrainerChallengeDetail'
import { TrainingPage } from './pages/trainer/TrainingPage'

function LoggedInLayout() {
  const { user, role, loading } = useAuth()

  useEffect(() => {
    if (!loading && user && isSupabaseConfigured()) {
      void clearPoisonedSyncQueue()
    }
  }, [user, loading])

  useEffect(() => initTrainerWorkspaceCacheInvalidation(), [])

  if (loading || (user && role == null)) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading" role="status" aria-live="polite">
          <span className="app-loading__ring" aria-hidden />
          <p className="app-loading__text">Загрузка…</p>
        </div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="app-shell">
      <AppHeader />
      {role === 'trainer' ? <DraftTabsBar /> : null}
      <BreadcrumbsBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

function RoleOutlet({ roles }) {
  const { role } = useAuth()
  if (!roles.includes(role)) {
    return <Navigate to={role === 'admin' ? '/admin' : '/trainer'} replace />
  }
  return <Outlet />
}

function HomeRedirect() {
  const { role } = useAuth()
  return <Navigate to={role === 'admin' ? '/admin' : '/trainer'} replace />
}

function AdminDiariesRedirect() {
  const loc = useLocation()
  const qs = loc.search || ''
  return <Navigate to={`/admin/clients${qs}`} replace />
}

function AdminLegacyTrainersRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'trainers')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

function AdminLegacyClubsRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'clubs')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

function AdminLegacyOrganizationRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  if (!sp.get('tab')) sp.set('tab', 'clubs')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

function AdminLegacyStatisticsRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'statistics')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<LoggedInLayout />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route element={<RoleOutlet roles={['trainer']} />}>
              <Route path="/trainer" element={<TrainerHome />} />
              <Route path="/trainer/clients" element={<TrainerClients />} />
              <Route path="/trainer/profile" element={<TrainerProfile />} />
              <Route path="/trainer/clients/:id" element={<ClientCard />} />
              <Route path="/trainer/workouts/:id" element={<TrainingPage />} />
              <Route path="/trainer/challenges/:challengeId" element={<TrainerChallengeDetail />} />
            </Route>
            <Route element={<RoleOutlet roles={['admin']} />}>
              <Route path="/admin/workouts/:id" element={<TrainingPage />} />
              <Route path="/admin" element={<AdminDashboard />}>
                <Route index element={null} />
                <Route path="structure" element={<AdminStructure />} />
                <Route path="organization" element={<AdminLegacyOrganizationRedirect />} />
                <Route path="trainers" element={<AdminLegacyTrainersRedirect />} />
                <Route path="statistics" element={<AdminLegacyStatisticsRedirect />} />
                <Route path="clients" element={<AdminClients />} />
                <Route path="clients/:id" element={<ClientCard />} />
                <Route path="diaries" element={<AdminDiariesRedirect />} />
                <Route path="exercises" element={<AdminExercises />} />
                <Route path="challenges" element={<AdminChallenges />} />
                <Route path="challenges/:challengeId" element={<AdminChallengeDetail />} />
                <Route path="diagnostics" element={<AdminDiagnostics />} />
                <Route path="clubs" element={<AdminLegacyClubsRedirect />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
