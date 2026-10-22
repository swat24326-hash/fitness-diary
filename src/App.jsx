import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { clearPoisonedSyncQueue } from './lib/syncService'
import { initTrainerWorkspaceCacheInvalidation } from './lib/trainerWorkspaceCache'
import { startDeviceHealthReporter } from './lib/deviceHealth/deviceHealthReporter.js'
import { isPwaUpdateInFlight } from './lib/appUpdateInFlightSession.js'
import { AppChromeTop } from './components/AppChromeTop'
import { AppHeader } from './components/AppHeader'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { UnknownRouteRedirect } from './components/UnknownRouteRedirect.jsx'
import { PushOpenNavigator } from './components/PushOpenNavigator.jsx'
import { ChatVoiceMiniPlayer } from './components/chat/ChatVoiceMiniPlayer.jsx'
import { AppWelcomeSplash } from './components/AppWelcomeSplash'
import { useWelcomeSplashHold } from './hooks/useWelcomeSplashHold.js'
import { LocalDbBlockedBanner } from './components/LocalDbBlockedBanner.jsx'
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
import { AdminTrainerDevicesPage } from './pages/admin/AdminTrainerDevicesPage.jsx'
import { AdminDeviceHealthPage } from './pages/admin/AdminDeviceHealthPage.jsx'
import { AdminClubCallLogPage } from './pages/admin/AdminClubCallLogPage.jsx'
import { ClubTrainerSchedulePage } from './pages/admin/ClubTrainerSchedulePage.jsx'
import { AdminLoyaltyJournal } from './pages/admin/AdminLoyaltyJournal.jsx'
import { ClubSupervisorSettings } from './pages/admin/ClubSupervisorSettings'
import { AdminInboxPage } from './pages/admin/AdminInboxPage.jsx'
import { ClubSupervisorClubTasks } from './pages/admin/ClubSupervisorClubTasks'
import { ClubSupervisorClients } from './pages/admin/ClubSupervisorClients'
import { IskraPanelProvider } from './context/IskraPanelContext'
import { HeartRateSessionsProvider } from './context/HeartRateSessionsContext'
import { Login } from './pages/Login'
import { StartHubPage } from './pages/StartHubPage'
import { roleHomePath } from './lib/roleHomePathCore.js'
import { SupervisorOfferGate } from './components/legal/SupervisorOfferGate.jsx'
import { ClientCard } from './pages/trainer/ClientCard'
import { TrainerHome } from './pages/trainer/TrainerHome'
import { TrainerNotificationsPage } from './pages/trainer/TrainerNotificationsPage.jsx'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { TrainerChallengeDetail } from './pages/trainer/TrainerChallengeDetail'
import { TrainerCalendarPage } from './pages/trainer/TrainerCalendarPage'
import { TrainingPage } from './pages/trainer/TrainingPage'
import { ClientMeStatus } from './pages/client/ClientMeStatus.jsx'

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

const PrivacyPolicyPage = lazy(() =>
  import('./pages/legal/PrivacyPolicyPage.jsx').then((m) => ({ default: m.PrivacyPolicyPage })),
)
const ChatRulesPage = lazy(() =>
  import('./pages/legal/ChatRulesPage.jsx').then((m) => ({ default: m.ChatRulesPage })),
)
const OfferPage = lazy(() =>
  import('./pages/legal/OfferPage.jsx').then((m) => ({ default: m.OfferPage })),
)
const ClientMePage = lazy(() => import('./pages/client/ClientMePage.jsx').then((m) => ({ default: m.ClientMePage })))
const ClientJoinPage = lazy(() => import('./pages/client/ClientJoinPage.jsx').then((m) => ({ default: m.ClientJoinPage })))
const ClientSettingsPage = lazy(() =>
  import('./pages/client/ClientSettingsPage.jsx').then((m) => ({ default: m.ClientSettingsPage })),
)
const ClientTrainingsPage = lazy(() =>
  import('./pages/client/ClientTrainingsPage.jsx').then((m) => ({ default: m.ClientTrainingsPage })),
)
const ClientPlanPage = lazy(() => import('./pages/client/ClientPlanPage.jsx').then((m) => ({ default: m.ClientPlanPage })))
const ClientNutritionPreviewPage = lazy(() =>
  import('./pages/client/ClientNutritionPreviewPage.jsx').then((m) => ({ default: m.ClientNutritionPreviewPage })),
)
const ClientNotificationsPage = lazy(() =>
  import('./pages/client/ClientNotificationsPage.jsx').then((m) => ({ default: m.ClientNotificationsPage })),
)
const ClientNotificationsPreviewPage = lazy(() =>
  import('./pages/client/ClientNotificationsPreviewPage.jsx').then((m) => ({
    default: m.ClientNotificationsPreviewPage,
  })),
)
const ClientNotificationsPreviewDetailPage = lazy(() =>
  import('./pages/client/ClientNotificationsPreviewPage.jsx').then((m) => ({
    default: m.ClientNotificationsPreviewDetailPage,
  })),
)
const ClientProgressPreviewPage = lazy(() =>
  import('./pages/client/ClientProgressPreviewPage.jsx').then((m) => ({
    default: m.ClientProgressPreviewPage,
  })),
)
const ClientHomePreviewPage = lazy(() =>
  import('./pages/client/ClientProgressPreviewPage.jsx').then((m) => ({
    default: m.ClientHomePreviewPage,
  })),
)
const ClientRatingPage = lazy(() =>
  import('./pages/client/ClientRatingPage.jsx').then((m) => ({ default: m.ClientRatingPage })),
)
const ClientInboxPage = lazy(() => import('./pages/client/ClientInboxPage.jsx').then((m) => ({ default: m.ClientInboxPage })))
const ClientInboxItemPage = lazy(() =>
  import('./pages/client/ClientInboxItemPage.jsx').then((m) => ({ default: m.ClientInboxItemPage })),
)
const ClientChatPage = lazy(() => import('./pages/client/ClientChatPage.jsx').then((m) => ({ default: m.ClientChatPage })))
const ClientAppProvider = lazy(() =>
  import('./pages/client/ClientAppContext.jsx').then((m) => ({ default: m.ClientAppProvider })),
)
/* Мессенджер сотрудников — отдельным куском: основной бандл планшета ограничен (verify-project-health), чанки в предкэше PWA. */
const StaffInboxPage = lazy(() => import('./pages/staff/StaffInboxPage.jsx').then((m) => ({ default: m.StaffInboxPage })))
const StaffInboxItemPage = lazy(() => import('./pages/staff/StaffInboxItemPage.jsx').then((m) => ({ default: m.StaffInboxItemPage })))
const StaffChatThread = lazy(() => import('./pages/staff/StaffChatThread.jsx').then((m) => ({ default: m.StaffChatThread })))
const StaffDmThread = lazy(() => import('./pages/staff/StaffDmThread.jsx').then((m) => ({ default: m.StaffDmThread })))
const CoachAppRoutesLazy = lazy(() => import('./pages/coach/CoachAppRoutes.jsx').then((m) => ({ default: m.CoachAppRoutes })))

/** Телефон тренера: вне LoggedInLayout — свой пропуск, без шапки, IndexedDB и sync зала. */
function CoachAppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="coach-app">
          <main className="coach-app__main">
            <ClientMeStatus title="Загружаем…" />
          </main>
        </div>
      }
    >
      <CoachAppRoutesLazy />
    </Suspense>
  )
}

/** Приложение клиента: вне LoggedInLayout, без шапки и sync зала. */
function ClientAppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="client-me">
          <main className="client-me__main">
            <ClientMeStatus title="Загружаем…" />
          </main>
        </div>
      }
    >
      <ClientAppProvider>
        <Routes>
          <Route path="join" element={<ClientJoinPage />} />
          <Route path="settings" element={<ClientSettingsPage />} />
          <Route path="trainings" element={<ClientTrainingsPage />} />
          <Route path="task" element={<ClientPlanPage key="homework" kind="homework" />} />
          <Route path="nutrition" element={<ClientPlanPage key="nutrition" kind="nutrition" />} />
          <Route path="nutrition-preview" element={<ClientNutritionPreviewPage />} />
          <Route path="notifications" element={<ClientNotificationsPage />} />
          <Route path="notifications-preview" element={<ClientNotificationsPreviewPage />} />
          <Route path="notifications-preview/:id" element={<ClientNotificationsPreviewDetailPage />} />
          <Route path="progress-preview" element={<ClientProgressPreviewPage />} />
          <Route path="home-preview" element={<ClientHomePreviewPage />} />
          <Route path="rate/:id" element={<ClientRatingPage />} />
          <Route path="inbox" element={<ClientInboxPage />} />
          <Route path="inbox/:id" element={<ClientInboxItemPage />} />
          <Route path="chat/:kind" element={<ClientChatPage />} />
          <Route path="*" element={<ClientMePage />} />
        </Routes>
      </ClientAppProvider>
    </Suspense>
  )
}

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
  const { user, role, loading, sessionRecovering } = useAuth()
  const splashBusy =
    loading ||
    (Boolean(user) && role == null) ||
    (sessionRecovering && !user) ||
    (!user && isPwaUpdateInFlight())
  const showWelcomeSplash = useWelcomeSplashHold(splashBusy)

  useEffect(() => {
    if (!loading && !sessionRecovering && user && isSupabaseConfigured()) {
      void clearPoisonedSyncQueue()
    }
  }, [user, loading, sessionRecovering])

  useEffect(() => initTrainerWorkspaceCacheInvalidation(), [])

  const reportDeviceHealth = Boolean(user) && role === 'trainer' && isSupabaseConfigured()
  useEffect(() => (reportDeviceHealth ? startDeviceHealthReporter() : undefined), [reportDeviceHealth])

  if (showWelcomeSplash) {
    const displayName =
      sessionRecovering && !user
        ? 'Восстанавливаем сессию…'
        : !user && isPwaUpdateInFlight()
          ? 'Обновляем приложение…'
          : undefined
    return <AppWelcomeSplash displayName={displayName} />
  }
  if (!user) {
    return <Navigate to="/" replace />
  }

  const isSalesManager = role === 'sales_manager'
  const isAdmin = role === 'admin'
  const isSupervisor = role === 'supervisor'
  const shellRole = isAdmin ? 'admin' : isSalesManager ? 'sales' : isSupervisor ? 'admin' : 'trainer'

  return (
    <AppErrorBoundary>
      <SupervisorOfferGate>
        <div className={`app-shell app-shell--${shellRole}`}>
          <HeartRateSessionsProvider>
            <IskraPanelProvider>
              <AppChromeTop>
                <AppHeader />
                {role === 'trainer' ? <DraftTabsBar /> : null}
              </AppChromeTop>
              <BreadcrumbsBar />
              <main className="app-main">
                <Suspense fallback={null}>
                  <Outlet />
                </Suspense>
              </main>
            </IskraPanelProvider>
          </HeartRateSessionsProvider>
        </div>
      </SupervisorOfferGate>
    </AppErrorBoundary>
  )
}

function RoleOutlet({ roles }) {
  const { role } = useAuth()
  if (!roles.includes(role)) {
    return <Navigate to={roleHomePath(role)} replace />
  }
  return <Outlet />
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

/** Бывшая «Структура → Диагностика» — теперь центр сбоев /admin/health (блок «Это устройство»). */
function AdminLegacyDiagnosticsRedirect() {
  const loc = useLocation()
  const sp = new URLSearchParams(loc.search || '')
  sp.delete('tab')
  const qs = sp.toString()
  return <Navigate to={`/admin/health${qs ? `?${qs}` : ''}`} replace />
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
  if (sp.get('tab') === 'diagnostics') return <AdminLegacyDiagnosticsRedirect />
  return <AdminStructure />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppPwaOverlays />
        <LocalDbBlockedBanner />
        <PushOpenNavigator />
        <ChatVoiceMiniPlayer />
        <Routes>
          <Route path="/" element={<StartHubPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/chat-rules" element={<ChatRulesPage />} />
          <Route path="/offer" element={<OfferPage />} />
          <Route path="/me/*" element={<ClientAppRoutes />} />
          <Route path="/coach/*" element={<CoachAppRoutes />} />
          <Route element={<LoggedInLayout />}>
            <Route element={<RoleOutlet roles={['trainer']} />}>
              <Route path="/trainer" element={<TrainerHome />} />
              <Route path="/trainer/notifications" element={<TrainerNotificationsPage />} />
              <Route path="/trainer/clients" element={<TrainerClients />} />
              <Route path="/trainer/profile" element={<TrainerProfile />} />
              <Route path="/trainer/clients/:id" element={<ClientCard />} />
              <Route path="/trainer/calendar" element={<TrainerCalendarPage />} />
              <Route path="/trainer/workouts/:id" element={<TrainingPage />} />
              <Route path="/trainer/challenges/:challengeId" element={<TrainerChallengeDetail />} />
            </Route>
            <Route element={<RoleOutlet roles={['trainer', 'sales_manager', 'supervisor']} />}>
              <Route path="/messages/:id" element={<StaffInboxItemPage />} />
            </Route>
            <Route element={<RoleOutlet roles={['trainer', 'sales_manager', 'supervisor', 'admin']} />}>
              <Route path="/messages" element={<StaffInboxPage />} />
              <Route path="/messages/dm/:userId" element={<StaffDmThread />} />
              <Route path="/messages/chat/:clientId/:kind" element={<StaffChatThread />} />
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
              <Route path="/sales/call-log" element={<AdminClubCallLogPage accessMode="sales_manager" />} />
              <Route path="/sales/loyalty" element={<AdminLoyaltyJournal accessMode="sales_manager" />} />
            </Route>
            <Route element={<RoleOutlet roles={['supervisor']} />}>
              <Route path="/club/workouts/:id" element={<TrainingPage />} />
              <Route path="/club" element={<AdminDashboard accessMode="supervisor" />}>
                <Route index element={null} />
                <Route path="statistics" element={<AdminStatistics />} />
                <Route path="sales" element={<AdminSales accessMode="supervisor" />} />
                <Route path="pnk" element={<SalesPnk />} />
                <Route path="clients" element={<ClubSupervisorClients />}>
                  <Route index element={null} />
                  <Route path=":id" element={<ClientCard />} />
                </Route>
                <Route path="call-log" element={<AdminClubCallLogPage accessMode="supervisor" />} />
                <Route path="trainer-schedule" element={<ClubTrainerSchedulePage accessMode="supervisor" />} />
                <Route path="challenges" element={<AdminChallenges />} />
                <Route path="challenges/:challengeId" element={<AdminChallengeDetail />} />
                <Route path="club-tasks" element={<ClubSupervisorClubTasks />} />
                <Route path="settings" element={<ClubSupervisorSettings />} />
                <Route path="inbox" element={<AdminInboxPage accessMode="supervisor" />} />
              </Route>
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
                <Route path="devices" element={<AdminTrainerDevicesPage />} />
                <Route path="health" element={<AdminDeviceHealthPage />} />
                <Route path="call-log" element={<AdminClubCallLogPage />} />
                <Route path="trainer-schedule" element={<ClubTrainerSchedulePage />} />
                <Route path="loyalty" element={<AdminLoyaltyJournal />} />
                <Route path="inbox" element={<AdminInboxPage />} />
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
          <Route path="*" element={<UnknownRouteRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
