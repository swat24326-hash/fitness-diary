import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import {
  isLocalDbUpgradeBlocked,
  LOCAL_DB_BLOCKED_TEXT,
  LOCAL_DB_UPGRADE_BLOCKED,
} from '../lib/localDbUpgradeWait.js'

export function LocalDbBlockedBanner() {
  const [blocked, setBlocked] = useState(isLocalDbUpgradeBlocked)

  useEffect(() => {
    const onChange = (e) => setBlocked(e?.detail?.blocked === true)
    window.addEventListener(LOCAL_DB_UPGRADE_BLOCKED, onChange)
    return () => window.removeEventListener(LOCAL_DB_UPGRADE_BLOCKED, onChange)
  }, [])

  if (!blocked) return null

  return (
    <div className="pwa-updated local-db-blocked" role="alert">
      <div className="pwa-updated__main">
        <AlertTriangle size={22} className="local-db-blocked__icon" aria-hidden />
        <div>
          <p className="pwa-updated__title">Данные на планшете не открываются</p>
          <p className="pwa-updated__sub muted">{LOCAL_DB_BLOCKED_TEXT}</p>
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-sm btn-touch" onClick={() => window.location.reload()}>
        <RefreshCw size={14} aria-hidden />
        Обновить
      </button>
    </div>
  )
}
