import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { isSupabaseConfigured } from './lib/supabase'
import { initAppErrorJournal } from './lib/appErrorJournal'
import { clearPoisonedSyncQueue, resetSyncQueueOnceAfterDeploy } from './lib/syncService'

initAppErrorJournal()
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import './styles/os-polish.css'

if (isSupabaseConfigured()) {
  void resetSyncQueueOnceAfterDeploy()
  void clearPoisonedSyncQueue()
}

createRoot(document.getElementById('root')).render(
  import.meta.env.PROD ? <App /> : <StrictMode><App /></StrictMode>,
)
