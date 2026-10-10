import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { TrainerDevicesSection } from './TrainerDevicesSection.jsx'
import { useTrainerDevices } from './useTrainerDevices.js'

/** Админ: устройства тренеров — разрешить / заменить / отозвать (STRATEGY §5.7). */
export function AdminTrainerDevicesPage() {
  const { devices, bindingActive, busy, error, load, act } = useTrainerDevices()
  return (
    <div className="admin-page">
      <AdminSectionHeader
        title="Устройства тренеров"
        lead="У тренера одно разрешённое устройство. Вход с нового — только после «Разрешить»."
      />
      <TrainerDevicesSection
        devices={devices}
        bindingActive={bindingActive}
        busy={busy}
        error={error}
        onReload={() => void load()}
        onAct={(id, op) => void act(id, op)}
      />
    </div>
  )
}
