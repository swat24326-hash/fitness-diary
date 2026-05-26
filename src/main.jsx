import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { isSupabaseConfigured } from './lib/supabase'
import { clearPoisonedSyncQueue, resetSyncQueueOnceAfterDeploy } from './lib/syncService'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'

if (isSupabaseConfigured()) {
  void resetSyncQueueOnceAfterDeploy()
  void clearPoisonedSyncQueue()
}

/** В dev PWA-plugin не подключает virtual:pwa-register — статический import ломал localhost (500). */
const PwaUpdatePromptLazy = import.meta.env.PROD
  ? lazy(() => import('./components/PwaUpdatePrompt.jsx').then((m) => ({ default: m.PwaUpdatePrompt })))
  : function PwaUpdatePromptDevStub() {
      return null
    }

const app = (
  <>
    {import.meta.env.PROD ? (
      <Suspense fallback={null}>
        <PwaUpdatePromptLazy />
      </Suspense>
    ) : null}
    <App />
  </>
)

createRoot(document.getElementById('root')).render(
  import.meta.env.PROD ? app : <StrictMode>{app}</StrictMode>,
)
