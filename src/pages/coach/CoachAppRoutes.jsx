import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { COACH_JOIN_PATH, coachQrTokenFromHash } from '../../lib/coach/coachJoinLink.js'
import { hasCoachSession, readSavedCoachQr, saveCoachQr } from '../../lib/coach/coachSession.js'
import { CoachAppProvider, useCoachApp } from './CoachAppContext.jsx'
import { CoachChatPage } from './CoachChatPage.jsx'
import { CoachChatsPage } from './CoachChatsPage.jsx'
import { CoachJoinPage } from './CoachJoinPage.jsx'
import { CoachMorePage } from './CoachMorePage.jsx'
import { CoachSignInPage } from './CoachSignInPage.jsx'
import { CoachTodayPage } from './CoachTodayPage.jsx'

/** Код из QR сразу в хранилище и прочь из адресной строки (не остаётся в истории и закладках). */
function takeQrToken() {
  const { pathname, hash } = window.location
  if (pathname.replace(/\/$/, '') === COACH_JOIN_PATH) {
    const token = coachQrTokenFromHash(hash)
    if (token && !hasCoachSession()) saveCoachQr(token)
    window.history.replaceState(null, '', '/coach')
  }
  return readSavedCoachQr()
}

function CoachRoutes() {
  const { signedIn } = useCoachApp()
  const [qrToken, setQrToken] = useState(takeQrToken)
  if (!signedIn) {
    return qrToken ? <CoachJoinPage token={qrToken} onUsePassword={() => setQrToken('')} /> : <CoachSignInPage />
  }
  return (
    <Routes>
      <Route index element={<CoachTodayPage />} />
      <Route path="chats" element={<CoachChatsPage />} />
      <Route path="chat/:clientId" element={<CoachChatPage />} />
      <Route path="more" element={<CoachMorePage />} />
      <Route path="*" element={<Navigate to="/coach" replace />} />
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
