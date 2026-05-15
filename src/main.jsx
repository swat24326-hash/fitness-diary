import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt.jsx'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {import.meta.env.PROD ? <PwaUpdatePrompt /> : null}
    <App />
  </StrictMode>,
)
