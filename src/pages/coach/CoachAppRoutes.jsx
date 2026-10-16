import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { handoffLaunchAction, handoffTokenFromSearch } from '../../lib/client/clientHandoffCore.js'
import { COACH_HOME } from '../../lib/pwa/appHomePath.js'
import { isCoachStandalone } from '../../lib/coach/coachInstall.js'
import { COACH_JOIN_PATH, coachQrTokenFromHash } from '../../lib/coach/coachJoinLink.js'
import { hasCoachSession, readSavedCoachQr, saveCoachQr } from '../../lib/coach/coachSession.js'
import { CoachAppProvider, useCoachApp } from './CoachAppContext.jsx'
import { CoachCalendarPage } from './CoachCalendarPage.jsx'
import { CoachChatPage } from './CoachChatPage.jsx'
import { CoachChatsPage } from './CoachChatsPage.jsx'
import { CoachClientsPage } from './CoachClientsPage.jsx'
import { CoachDmPage } from './CoachDmPage.jsx'
import { CoachGroupPage } from './CoachGroupPage.jsx'
import { CoachJoinPage } from './CoachJoinPage.jsx'
import { CoachMorePage } from './CoachMorePage.jsx'
import { CoachNotificationsPage } from './CoachNotificationsPage.jsx'
import { CoachSignInPage } from './CoachSignInPage.jsx'

/** Вход значка iPhone из адреса: переживает пересборку экрана, как сохранённый QR. */
let launchHandoff = ''

/**
 * Код из QR — сразу в хранилище и прочь из адресной строки (не остаётся в истории и закладках).
 * Значок «Домой» без входа с /coach?h=… — входит по приглашению из Safari.
 * @returns {{ kind: 'qr' | 'handoff', token: string } | null}
 */
function takeLaunch() {
  const { pathname, hash, search } = window.location
  if (pathname.replace(/\/$/, '') === COACH_JOIN_PATH) {
    const token = coachQrTokenFromHash(hash)
    if (token && !hasCoachSession()) saveCoachQr(token)
    window.history.replaceState(null, '', COACH_HOME)
  }
  const h = handoffTokenFromSearch(search)
  if (h) {
    const action = handoffLaunchAction({ standalone: isCoachStandalone(), hasSession: hasCoachSession(), token: h })
    if (action !== 'none') window.history.replaceState(null, '', window.location.pathname)
    if (action === 'redeem') launchHandoff = h
  }
  if (launchHandoff) return { kind: 'handoff', token: launchHandoff }
  const qr = readSavedCoachQr()
  return qr ? { kind: 'qr', token: qr } : null
}

function CoachRoutes() {
  const { signedIn } = useCoachApp()
  const [launch, setLaunch] = useState(takeLaunch)
  if (!signedIn) {
    if (!launch) return <CoachSignInPage />
    const usePassword = () => {
      launchHandoff = ''
      setLaunch(null)
    }
    return <CoachJoinPage key={launch.kind} kind={launch.kind} token={launch.token} onUsePassword={usePassword} />
  }
  return (
    <Routes>
      <Route index element={<CoachCalendarPage />} />
      <Route path="calendar" element={<Navigate to={COACH_HOME} replace />} />
      <Route path="chats" element={<CoachChatsPage />} />
      <Route path="chat/:clientId" element={<CoachChatPage />} />
      <Route path="chat/:clientId/:kind" element={<CoachChatPage />} />
      <Route path="dm/:userId" element={<CoachDmPage />} />
      <Route path="group" element={<CoachGroupPage />} />
      <Route path="clients" element={<CoachClientsPage />} />
      <Route path="notifications" element={<CoachNotificationsPage />} />
      <Route path="more" element={<CoachMorePage />} />
      <Route path="*" element={<Navigate to={COACH_HOME} replace />} />
    </Routes>
  )
}

/** /coach — приложение тренера на телефоне: без шапки зала, IndexedDB и sync. Ссылка из push открывается после входа. */
export function CoachAppRoutes() {
  return (
    <CoachAppProvider>
      <CoachRoutes />
    </CoachAppProvider>
  )
}
