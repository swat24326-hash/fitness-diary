import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HR_STALE_MS,
  canRememberBluetoothDevices,
  connectHeartRateNotifications,
  findGrantedHeartRateDevice,
  humanizeBleHrError,
  isWebBluetoothHrAvailable,
  requestHeartRateDevice,
} from '../lib/hr/bleHeartRateCore'
import {
  clearRememberedHrDevice,
  readRememberedHrDevice,
  writeRememberedHrDevice,
} from '../lib/hr/rememberedHrDevice'
import { useSetHeartRateFocus } from '../context/HeartRateFocusContext'

/**
 * @param {{ trainerUserId?: string | null }} opts
 */
export function useHeartRateSession({ trainerUserId } = {}) {
  const setFocus = useSetHeartRateFocus()
  const [status, setStatus] = useState('idle') // idle | connecting | live | error
  const [bpm, setBpm] = useState(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [remembered, setRemembered] = useState(() => readRememberedHrDevice(trainerUserId))
  const [deviceName, setDeviceName] = useState('')

  const disconnectRef = useRef(null)
  const lastBpmAtRef = useRef(0)
  const staleTimerRef = useRef(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    setRemembered(readRememberedHrDevice(trainerUserId))
  }, [trainerUserId])

  const clearStaleWatch = useCallback(() => {
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current)
      staleTimerRef.current = null
    }
  }, [])

  const teardown = useCallback(() => {
    clearStaleWatch()
    try {
      disconnectRef.current?.()
    } catch {
      /* ignore */
    }
    disconnectRef.current = null
    lastBpmAtRef.current = 0
    setFocus(false)
  }, [clearStaleWatch, setFocus])

  useEffect(() => () => teardown(), [teardown])

  const startStaleWatch = useCallback(() => {
    clearStaleWatch()
    staleTimerRef.current = setInterval(() => {
      if (!aliveRef.current) return
      const age = Date.now() - lastBpmAtRef.current
      setStale(age > HR_STALE_MS)
    }, 800)
  }, [clearStaleWatch])

  const attachDevice = useCallback(
    async (device) => {
      const { disconnect } = await connectHeartRateNotifications(device, {
        onBpm: (nextBpm) => {
          if (!aliveRef.current) return
          lastBpmAtRef.current = Date.now()
          setBpm(nextBpm)
          setStale(false)
          setStatus('live')
          setError('')
          setFocus(true)
        },
        onDisconnect: () => {
          if (!aliveRef.current) return
          clearStaleWatch()
          disconnectRef.current = null
          setStatus((s) => (s === 'connecting' ? 'error' : 'idle'))
          setStale(true)
          setFocus(false)
          setError((prev) => prev || 'Связь с датчиком потеряна')
        },
      })
      disconnectRef.current = disconnect
      const name = String(device.name ?? '').trim() || 'Пульсометр'
      setDeviceName(name)
      if (trainerUserId && device.id) {
        writeRememberedHrDevice(trainerUserId, { deviceId: device.id, name })
        setRemembered({ deviceId: String(device.id), name, savedAt: Date.now() })
      }
      startStaleWatch()
      setStatus('live')
      setFocus(true)
      setError('')
    },
    [clearStaleWatch, setFocus, startStaleWatch, trainerUserId],
  )

  const connectWithPicker = useCallback(async () => {
    const device = await requestHeartRateDevice()
    await attachDevice(device)
  }, [attachDevice])

  const connect = useCallback(async () => {
    if (status === 'connecting' || status === 'live') return
    setError('')
    setStatus('connecting')
    setStale(false)
    try {
      if (!isWebBluetoothHrAvailable()) {
        const e = new Error('Этот браузер не поддерживает Bluetooth-пульс')
        e.name = 'NotSupportedError'
        throw e
      }
      const mem = readRememberedHrDevice(trainerUserId)
      if (mem?.deviceId && canRememberBluetoothDevices()) {
        try {
          const granted = await findGrantedHeartRateDevice(mem.deviceId)
          if (granted) {
            await attachDevice(granted)
            return
          }
        } catch {
          teardown()
        }
      }
      await connectWithPicker()
    } catch (err) {
      if (!aliveRef.current) return
      teardown()
      setBpm(null)
      setStatus('error')
      setError(humanizeBleHrError(err))
      setFocus(false)
    }
  }, [attachDevice, connectWithPicker, setFocus, status, teardown, trainerUserId])

  const pickOtherDevice = useCallback(async () => {
    if (status === 'connecting') return
    teardown()
    setBpm(null)
    setStale(false)
    setError('')
    if (trainerUserId) clearRememberedHrDevice(trainerUserId)
    setRemembered(null)
    setDeviceName('')
    setStatus('connecting')
    try {
      await connectWithPicker()
    } catch (err) {
      if (!aliveRef.current) return
      teardown()
      setStatus('error')
      setError(humanizeBleHrError(err))
      setFocus(false)
    }
  }, [connectWithPicker, setFocus, status, teardown, trainerUserId])

  const disconnect = useCallback(() => {
    teardown()
    setBpm(null)
    setStale(false)
    setStatus('idle')
    setError('')
    setDeviceName('')
  }, [teardown])

  return {
    status,
    bpm,
    stale,
    error,
    remembered,
    deviceName: deviceName || remembered?.name || '',
    supported: isWebBluetoothHrAvailable(),
    connect,
    pickOtherDevice,
    disconnect,
  }
}
