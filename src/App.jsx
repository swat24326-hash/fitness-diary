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
import { AdminClientsKeepAliveLayout } from './components/admin/AdminClientsKeepAliveLayout.jsx'
import { SalesClients } from './pages/admin/SalesClients'
import { AdminExcelLists } from './pages/admin/AdminExcelLists'
import { AdminStructure } from './pages/admin/AdminStructure'
import { AdminStatistics } from './pages/admin/AdminStatistics'
import { AdminSales } from './pages/admin/AdminSales'
import { AdminChallenges } from './pages/admin/AdminChallenges'
import { AdminChallengeDetail } from './pages/admin/AdminChallengeDetail'
import { AdminClubTasks } from './pages/admin/AdminClubTasks'
import { SalesClubTasks } from './pages/admin/SalesClubTasks'
import { SalesPnk } from './pages/admin/SalesPnk'
import { AdminDeletionLogPage } from './pages/admin/AdminDeletionLogPage.jsx'
import { IskraPanelProvider } from './context/IskraPanelContext'
import { HeartRateSessionsProvider } from './context/HeartRateSessionsContext'
import { Login } from './pages/Login'
import { ClientCard } from './pages/trainer/ClientCard'
import { TrainerHome } from './pages/trainer/TrainerHome'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { TrainerChallengeDetail } from './pages/trainer/TrainerChallengeDetail'
import { TrainingPage } from './pages/trainer/TrainingPage'

/** В dev virtual:pwa-register недоступен — только prod, внутри Router (нужен useLocation). */
function lazyPwaOverlay(importer, exportName) {
  if (!import.meta.env.PROD) return () => null
  return lazy(() =>
    importer()
      .then((m) => {
        const Comp = m?.[exportName]
        if (!Comp) {
          throw new Error(`Failed to fetch dynamically imported module: ${exportName}`)
        }
        return { default: Comp }
      })
      .catch(async (err) => {
        const { recoverFromStaleViteDeploy } = await import('./lib/viteChunkReload.js')
        await recoverFromStaleViteDeploy()
        throw err
      }),
  )
}

const PwaUpdatePromptLazy = lazyPwaOverlay(
  () => import('./components/PwaUpdatePrompt.jsx'),
  'PwaUpdatePrompt',
)

const AppUpdatedBannerLazy = lazyPwaOverlay(
  () => import('./components/AppUpdatedBanner.jsx'),
  'AppUpdatedBanner',
)

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
  const shellRole = isAdmin ? 'admin' : isSalesManager ? 'sales' : 'trainer'

  return (
    <div className={`app-shell app-shell--${shellRole}`}>
      <HeartRateSessionsProvider>
        <IskraPanelProvider>
          <div className="app-chrome-top">
            <AppHeader />
            {role === 'trainer' ? <DraftTabsBar /> : null}
          </div>
          <BreadcrumbsBar />
          <main className="app-main">
            <AppErrorBoundary>
              <Outlet />
            </AppErrorBoundary>
          </main>
        </IskraPanelProvider>
      </HeartRateSessionsProvider>
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

function AdminLegacyDiagnosticsRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'diagnostics')
  return <Navigate to={`/admin/structure?${sp.toString()}`} replace />
}

function AdminLegacyIskraSettingsRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.set('tab', 'iskra-settings')
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
              <Route path="/sales/clients" element={<SalesClients />}>
                <Route index element={null} />
                <Route path=":id" element={<ClientCard />} />
              </Route>
              <Route path="/sales/deletion-log" element={<AdminDeletionLogPage accessMode="sales_manager" />} />
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
                <Route path="clients" element={<AdminClientsKeepAliveLayout />}>
                  <Route index element={null} />
                  <Route path=":id" element={<ClientCard />} />
                </Route>
                <Route path="deletion-log" element={<AdminDeletionLogPage />} />
                <Route path="excel-lists" element={<AdminExcelLists />} />
                <Route path="diaries" element={<AdminDiariesRedirect />} />
                <Route path="exercises" element={<AdminLegacyExercisesRedirect />} />
                <Route path="challenges" element={<AdminChallenges />} />
                <Route path="challenges/:challengeId" element={<AdminChallengeDetail />} />
                <Route path="diagnostics" element={<AdminLegacyDiagnosticsRedirect />} />
                <Route path="iskra-settings" element={<AdminLegacyIskraSettingsRedirect />} />
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
