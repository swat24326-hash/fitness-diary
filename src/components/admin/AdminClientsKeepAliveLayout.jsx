import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AdminClients } from '../../pages/admin/AdminClients.jsx'
import {
  adminClientsListBasePath,
  isAdminClientsCardPathname,
} from '../../lib/admin/adminClientsKeepAliveCore.js'

/**
 * Список клиентов не размонтируется при уходе на карточку (скрыт CSS) —
 * «назад» без мигания на планшете.
 *
 * Deep-link сразу на карточку: список монтируется только после первого визита списка.
 *
 * @param {{ accessMode?: 'admin' | 'sales_manager' }} [props]
 */
export function AdminClientsKeepAliveLayout({ accessMode = 'admin' } = {}) {
  const location = useLocation()
  const base = adminClientsListBasePath(accessMode)
  const onCard = isAdminClientsCardPathname(location.pathname, base)
  const [listMounted, setListMounted] = useState(() => !onCard)

  useEffect(() => {
    if (!onCard) setListMounted(true)
  }, [onCard])

  return (
    <>
      {listMounted ? (
        <div className="admin-clients-keepalive" hidden={onCard} aria-hidden={onCard}>
          <AdminClients accessMode={accessMode} listUiActive={!onCard} />
        </div>
      ) : null}
      <Outlet />
    </>
  )
}
