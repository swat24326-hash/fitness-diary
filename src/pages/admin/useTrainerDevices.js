import { useCallback, useEffect, useState } from 'react'
import { fetchTrainerDevices, setTrainerDevice } from '../../lib/admin/trainerDevicesService.js'

/** Список устройств тренеров + действия админа. */
export function useTrainerDevices() {
  const [devices, setDevices] = useState([])
  const [bindingActive, setBindingActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const out = await fetchTrainerDevices()
      setDevices(out.devices)
      setBindingActive(out.bindingActive)
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить устройства')
    } finally {
      setBusy(false)
    }
  }, [])

  const act = useCallback(
    async (id, op) => {
      setBusy(true)
      setError('')
      try {
        await setTrainerDevice(id, op)
        await load()
      } catch (e) {
        setError(e?.message ? String(e.message) : 'Не удалось сохранить')
        setBusy(false)
      }
    },
    [load],
  )

  useEffect(() => {
    void load()
  }, [load])

  return { devices, bindingActive, busy, error, load, act }
}
