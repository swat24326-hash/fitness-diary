import { Navigate, Route, Routes } from 'react-router-dom'
import { CoachAppProvider, useCoachApp } from './CoachAppContext.jsx'
import { CoachChatPage } from './CoachChatPage.jsx'
import { CoachChatsPage } from './CoachChatsPage.jsx'
import { CoachMorePage } from './CoachMorePage.jsx'
import { CoachSignInPage } from './CoachSignInPage.jsx'
import { CoachTodayPage } from './CoachTodayPage.jsx'

function CoachRoutes() {
  const { signedIn } = useCoachApp()
  if (!signedIn) return <CoachSignInPage />
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
