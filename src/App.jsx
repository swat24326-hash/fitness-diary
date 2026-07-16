import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { clearPoisonedSyncQueue } from './lib/syncService'
import { initTrainerWorkspaceCacheInvalidation } from './lib/trainerWorkspaceCache'
import { AppHeader } from './components/AppHeader'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppWelcomeSplash } from './components/AppWelcomeSplash'
import { DraftTabsBar } from './components/DraftTabsBar'
import { BreadcrumbsBar } from './components/BreadcrumbsBar'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminClients } from './pages/admin/AdminClients'
import { AdminStructure } from './pages/admin/AdminStructure'
import { AdminStatistics } from './pages/admin/AdminStatistics'
import { AdminSales } from './pages/admin/AdminSales'
import { AdminChallenges } from './pages/admin/AdminChallenges'
import { AdminChallengeDetail } from './pages/admin/AdminChallengeDetail'
import { AdminDiagnostics } from './pages/admin/AdminDiagnostics'
import { AdminIskraSettings } from './pages/admin/AdminIskraSettings'
import { AdminClubTasks } from './pages/admin/AdminClubTasks'
import { SalesClubTasks } from './pages/admin/SalesClubTasks'
import { SalesPnk } from './pages/admin/SalesPnk'
import { IskraPanelProvider } from './context/IskraPanelContext'
import { Login } from './pages/Login'
import { ClientCard } from './pages/trainer/ClientCard'
import { TrainerHome } from './pages/trainer/TrainerHome'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { TrainerChallengeDetail } from './pages/trainer/TrainerChallengeDetail'
import { TrainingPage } from './pages/trainer/TrainingPage'

/** В dev virtual:pwa-register недоступен — только prod, внутри Router (нужен useLocation). */
const PwaUpdatePromptLazy = import.meta.env.PROD
  ? lazy(() => import('./components/PwaUpdatePrompt.jsx').then((m) => ({ default: m.PwaUpdatePrompt })))
  : () => null

const AppUpdatedBannerLazy = import.meta.env.PROD
  ? lazy(() => import('./components/AppUpdatedBanner.jsx').then((m) => ({ default: m.AppUpdatedBanner })))
  : () => null

function AppPwaOverlays() {
  if (!import.meta.env.PROD) return null
  return (
    <Suspense fallback={null}>
      <PwaUpdatePromptLazy />
      <AppUpdatedBannerLazy />
    </Suspense>
  )
}

function LoggedInLayout() {
  const { user, role, loading, sessionRecovering, hasStoredSession } = useAuth()

  useEffect(() => {
    if (!loading && !sessionRecovering && user && isSupabaseConfigured()) {
      void clearPoisonedSyncQueue()
    }
  }, [user, loading, sessionRecovering])

  useEffect(() => initTrainerWorkspaceCacheInvalidation(), [])

  if (loading || sessionRecovering || (user && role == null)) {
    return <AppWelcomeSplash />
  }
  if (!user && hasStoredSession) {
    return <AppWelcomeSplash displayName="Восстанавливаем сессию…" />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isSalesManager = role === 'sales_manager'
  const isAdmin = role === 'admin'

  return (
    <div
      className={`app-shell${isSalesManager ? ' app-shell--sales' : ''}${isAdmin ? ' app-shell--admin' : ''}`}
    >
      <IskraPanelProvider>
        <AppHeader />
        {role === 'trainer' ? <DraftTabsBar /> : null}
        <BreadcrumbsBar />
        <main className="app-main">
          <AppErrorBoundary>
            <Outlet />
          </AppErrorBoundary>
        </main>
      </IskraPanelProvider>
    </div>
  )
}

function roleHomePath(role) {
  if (role === 'admin') return '/admin'
  if (role === 'sales_manager') return '/sales'
  return '/trainer'
}

function RoleOutlet({ roles }) {
  const { role } = useAuth()
  if (!roles.includes(role)) {
    return <Navigate to={roleHomePath(role)} replace />
  }
  return <Outlet />
}

function HomeRedirect() {
  const { role } = useAuth()
  return <Navigate to={roleHomePath(role)} replace />
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

function AdminLegacyExercisesRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'exercises')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

function AdminLegacyStructureStatisticsTabRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  if (sp.get('tab') === 'statistics') {
    sp.delete('tab')
    const qs = sp.toString()
    return <Navigate to={`/admin/statistics${qs ? `?${qs}` : ''}`} replace />
  }
  return <AdminStructure />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppPwaOverlays />
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
            <Route element={<RoleOutlet roles={['sales_manager']} />}>
              <Route path="/sales" element={<AdminSales accessMode="sales_manager" />} />
              <Route path="/sales/club-tasks" element={<SalesClubTasks />} />
              <Route path="/sales/pnk" element={<SalesPnk />} />
            </Route>
            <Route element={<RoleOutlet roles={['admin']} />}>
              <Route path="/admin/workouts/:id" element={<TrainingPage />} />
              <Route path="/admin" element={<AdminDashboard />}>
                <Route index element={null} />
                <Route path="structure" element={<AdminLegacyStructureStatisticsTabRedirect />} />
                <Route path="organization" element={<AdminLegacyOrganizationRedirect />} />
                <Route path="trainers" element={<AdminLegacyTrainersRedirect />} />
                <Route path="statistics" element={<AdminStatistics />} />
                <Route path="sales" element={<AdminSales />} />
                <Route path="pnk" element={<SalesPnk />} />
                <Route path="clients" element={<AdminClients />} />
                <Route path="clients/:id" element={<ClientCard />} />
                <Route path="diaries" element={<AdminDiariesRedirect />} />
                <Route path="exercises" element={<AdminLegacyExercisesRedirect />} />
                <Route path="challenges" element={<AdminChallenges />} />
                <Route path="challenges/:challengeId" element={<AdminChallengeDetail />} />
                <Route path="diagnostics" element={<AdminDiagnostics />} />
                <Route path="iskra-settings" element={<AdminIskraSettings />} />
                <Route path="club-tasks" element={<AdminClubTasks />} />
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
