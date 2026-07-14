import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { consumeAppUpdateNotice } from '../lib/appUpdateState'
import { getClientBuildTimeLabel, getClientBuildAgeLabel } from '../lib/appBuildInfo'

const AUTO_DISMISS_MS = 12_000

export function AppUpdatedBanner() {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const n = consumeAppUpdateNotice()
    if (n?.changed) setNotice(n)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [notice])

  if (!notice) return null

  return (
    <div className="pwa-updated" role="status" aria-live="polite">
      <div className="pwa-updated__main">
        <CheckCircle2 size={22} className="pwa-updated__icon" aria-hidden />
        <div>
          <p className="pwa-updated__title">Приложение обновлено</p>
          <p className="pwa-updated__sub muted">
            FIT-CITY на новой версии
            {notice.bundleId ? (
              <>
                {' '}
                · сборка <span className="pwa-updated__build">{notice.bundleId}</span>
                {getClientBuildTimeLabel() !== '—' ? (
                  <span className="pwa-updated__build-time">
                    {' '}
                    · {getClientBuildTimeLabel()}
                    {getClientBuildAgeLabel() ? ` (${getClientBuildAgeLabel()})` : ''}
                  </span>
                ) : null}
              </>
            ) : null}
            . Можно продолжать работу.
          </p>
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-sm btn-touch" onClick={() => setNotice(null)}>
        Готово
      </button>
    </div>
  )
}
