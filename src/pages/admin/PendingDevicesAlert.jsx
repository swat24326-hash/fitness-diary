import { TabletSmartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTrainerDevices } from '../../lib/admin/trainerDevicesService.js'

/** Главная админа: красная плашка, если устройство тренера ждёт «Разрешить». Сбой загрузки — молча. */
export function PendingDevicesAlert({ to }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    fetchTrainerDevices()
      .then((out) => {
        if (alive) setCount(out.devices.filter((d) => d.status === 'pending').length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!count) return null
  return (
    <Link to={to} className="admin-home__devices-alert" role="alert">
      <TabletSmartphone size={22} aria-hidden />
      <span>
        <strong>Устройства ждут разрешения: {count}</strong> — тренер не сможет войти, пока вы не нажмёте «Разрешить»
      </span>
    </Link>
  )
}
