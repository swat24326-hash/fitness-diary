import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt.jsx'
import { isSupabaseConfigured } from './lib/supabase'
import { clearPoisonedSyncQueue, resetSyncQueueOnceAfterDeploy } from './lib/syncService'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'

if (isSupabaseConfigured()) {
  void resetSyncQueueOnceAfterDeploy()
  void clearPoisonedSyncQueue()
}

const app = (
  <>
    {import.meta.env.PROD ? <PwaUpdatePrompt /> : null}
    <App />
  </>
)

createRoot(document.getElementById('root')).render(
  import.meta.env.PROD ? app : <StrictMode>{app}</StrictMode>,
)
