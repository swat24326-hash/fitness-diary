import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { UNKNOWN_ROUTE_TRIED_KEY, decideUnknownRoute } from '../lib/appUnknownRouteCore.js'
import { applyPwaUpdate } from '../lib/appUpdateApplyService.js'
import { hasNewerAppVersion } from '../lib/appUnknownRouteService.js'

function readTried() {
  try {
    return sessionStorage.getItem(UNKNOWN_ROUTE_TRIED_KEY)
  } catch {
    return null
  }
}

function markTried(path) {
  try {
    sessionStorage.setItem(UNKNOWN_ROUTE_TRIED_KEY, path)
  } catch {
    /* без sessionStorage — одна попытка на загрузку страницы */
  }
}

/** Незнакомый адрес: новая версия есть — обновиться и открыть его же; нет — на главную. */
export function UnknownRouteRedirect() {
  const { pathname } = useLocation()
  const [home, setHome] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const hasNewVersion = await hasNewerAppVersion().catch(() => false)
      if (!alive) return
      if (decideUnknownRoute({ path: pathname, triedPath: readTried(), hasNewVersion }) === 'home') {
        setHome(true)
        return
      }
      markTried(pathname)
      const result = await applyPwaUpdate({ manual: false })
      if (alive && result.mode === 'aborted') setHome(true)
    })()
    return () => {
      alive = false
    }
  }, [pathname])

  if (home) return <Navigate to="/" replace />
  return (
    <section className="os-empty-card" role="status">
      <h2 className="os-empty-card__title">Загружаем…</h2>
    </section>
  )
}
