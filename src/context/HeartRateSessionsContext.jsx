import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import {
  HR_STALE_MS,
  canRememberBluetoothDevices,
  connectHeartRateNotifications,
  findGrantedHeartRateDevice,
  humanizeBleHrError,
  isWebBluetoothHrAvailable,
  requestHeartRateDeviceWithFallback,
  webBluetoothHrUnavailableHint,
} from '../lib/hr/bleHeartRateCore'
import {
  HR_MAX_SLOTS,
  hrChipSurname,
  showHrChipName,
} from '../lib/hr/hrSessionsCore'
import {
  appendHrSample,
  buildHrSessionSummary,
  hrZoneForBpm,
} from '../lib/hr/hrSessionAgg'
import {
  clearDeviceIdForClient,
  readDeviceIdForClient,
  writeDeviceIdForClient,
} from '../lib/hr/hrClientDeviceMap'
import {
  clearHrSamples,
  clearLegacyHrSamples,
  migrateHrSamplesScope,
  readHrSamples,
  writeHrSamples,
} from '../lib/hr/hrSampleBufferStore'
import {
  readRememberedHrDevices,
  removeRememberedHrDevice,
  writeRememberedHrDevice,
} from '../lib/hr/rememberedHrDevice'

const HeartRateSessionsContext = createContext(null)

const DEFAULT_MAX_HR = 184

export function HeartRateSessionsProvider({ children }) {
  const { user } = useAuth()
  const trainerUserId = user?.id ?? null
  /** @type {React.MutableRefObject<Map<string, { disconnect: () => void, lastBpmAt: number, deviceId: string, maxHr: number }>>} */
  const runtimeRef = useRef(new Map())
  /** @type {React.MutableRefObject<Map<string, Array<{ t: number, bpm: number }>>>} */
  const samplesRef = useRef(new Map())
  /** clientId → trainingId (буфер только этой тренировки) */
  const trainingScopeRef = useRef(new Map())
  const maxHrRef = useRef(new Map())
  const persistTimerRef = useRef(new Map())
  const staleTimerRef = useRef(null)
  const aliveRef = useRef(true)
  const [slots, setSlots] = useState([])
  const [bannerError, setBannerError] = useState('')
  const [samplesEpoch, setSamplesEpoch] = useState(0)
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  const scopeFor = useCallback((clientId) => {
    const tid = trainingScopeRef.current.get(String(clientId ?? ''))
    return tid ? String(tid) : ''
  }, [])

  const schedulePersist = useCallback(
    (clientId) => {
      const id = String(clientId)
      if (!trainerUserId) return
      const tid = scopeFor(id)
      if (!tid) return
      const prev = persistTimerRef.current.get(id)
      if (prev) clearTimeout(prev)
      persistTimerRef.current.set(
        id,
        setTimeout(() => {
          persistTimerRef.current.delete(id)
          writeHrSamples(trainerUserId, id, tid, samplesRef.current.get(id) ?? [])
        }, 400),
      )
    },
    [scopeFor, trainerUserId],
  )

  const bindTrainingScope = useCallback(
    (clientId, trainingId) => {
      const id = String(clientId ?? '').trim()
      const tid = String(trainingId ?? '').trim()
      if (!id || !tid) return
      const prev = trainingScopeRef.current.get(id)
      if (trainerUserId) clearLegacyHrSamples(trainerUserId, id)
      if (prev === tid) return
      trainingScopeRef.current.set(id, tid)
      // Другая тренировка — не тащим RAM/хвост прошлой
      samplesRef.current.delete(id)
      const fromStore = trainerUserId ? readHrSamples(trainerUserId, id, tid) : []
      if (fromStore.length) samplesRef.current.set(id, fromStore)
      setSamplesEpoch((n) => n + 1)
    },
    [trainerUserId],
  )

  const migrateTrainingScope = useCallback(
    (clientId, fromTrainingId, toTrainingId) => {
      const id = String(clientId ?? '').trim()
      const from = String(fromTrainingId ?? '').trim()
      const to = String(toTrainingId ?? '').trim()
      if (!id || !from || !to || from === to) return
      if (trainerUserId) {
        migrateHrSamplesScope(trainerUserId, id, from, to)
        // RAM мог быть новее storage (debounce persist) — сразу пишем в новый ключ
        const ram = samplesRef.current.get(id)
        if (ram?.length) writeHrSamples(trainerUserId, id, to, ram)
      }
      trainingScopeRef.current.set(id, to)
      setSamplesEpoch((n) => n + 1)
    },
    [trainerUserId],
  )

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (staleTimerRef.current) clearInterval(staleTimerRef.current)
      for (const t of persistTimerRef.current.values()) clearTimeout(t)
      persistTimerRef.current.clear()
      for (const rt of runtimeRef.current.values()) {
        try {
          rt.disconnect?.()
        } catch {
          /* ignore */
        }
      }
      runtimeRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (staleTimerRef.current) clearInterval(staleTimerRef.current)
    staleTimerRef.current = setInterval(() => {
      if (!aliveRef.current) return
      const now = Date.now()
      setSlots((prev) => {
        let changed = false
        const next = prev.map((s) => {
          if (s.status !== 'live') return s
          const rt = runtimeRef.current.get(s.clientId)
          if (!rt) return s
          const stale = now - rt.lastBpmAt > HR_STALE_MS
          if (stale === s.stale) return s
          changed = true
          return { ...s, stale }
        })
        return changed ? next : prev
      })
    }, 800)
    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current)
    }
  }, [])

  const patchSlot = useCallback((clientId, patch) => {
    setSlots((prev) => prev.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)))
  }, [])

  const removeSlot = useCallback((clientId) => {
    const id = String(clientId)
    const rt = runtimeRef.current.get(id)
    if (rt) {
      try {
        rt.disconnect?.()
      } catch {
        /* ignore */
      }
      runtimeRef.current.delete(id)
    }
    setSlots((prev) => prev.filter((s) => s.clientId !== id))
  }, [])

  const attachToClient = useCallback(
    async (clientId, clientName, device, opts = {}) => {
      const id = String(clientId)
      const maxHr = Number(opts.maxHr) > 0 ? Number(opts.maxHr) : DEFAULT_MAX_HR
      maxHrRef.current.set(id, maxHr)

      const prevRt = runtimeRef.current.get(id)
      if (prevRt) {
        try {
          prevRt.disconnect?.()
        } catch {
          /* ignore */
        }
        runtimeRef.current.delete(id)
      }

      // Не обнуляем буфер этой тренировки: RAM → sessionStorage → продолжаем
      const tid = scopeFor(id)
      const existing =
        samplesRef.current.get(id) ??
        (trainerUserId && tid ? readHrSamples(trainerUserId, id, tid) : [])
      samplesRef.current.set(id, existing)
      setSamplesEpoch((n) => n + 1)

      const { disconnect } = await connectHeartRateNotifications(device, {
        onBpm: (bpm) => {
          if (!aliveRef.current) return
          const rt = runtimeRef.current.get(id)
          if (rt) rt.lastBpmAt = Date.now()
          const prev = samplesRef.current.get(id) ?? []
          const next = appendHrSample(prev, bpm)
          samplesRef.current.set(id, next)
          if (next.length !== prev.length) {
            setSamplesEpoch((n) => n + 1)
            schedulePersist(id)
          }
          const zone = hrZoneForBpm(bpm, maxHrRef.current.get(id) ?? DEFAULT_MAX_HR)
          patchSlot(id, { bpm, stale: false, status: 'live', error: '', zone })
        },
        onDisconnect: () => {
          if (!aliveRef.current) return
          runtimeRef.current.delete(id)
          schedulePersist(id)
          setSlots((prev) =>
            prev.map((s) =>
              s.clientId === id
                ? { ...s, status: 'lost', stale: true, error: 'Связь потеряна' }
                : s,
            ),
          )
          setBannerError('Связь потеряна — нажмите «Снова» на чипе')
        },
      })

      const deviceId = String(device.id ?? '')
      const deviceName = String(device.name ?? '').trim() || 'Пульсометр'
      runtimeRef.current.set(id, { disconnect, lastBpmAt: Date.now(), deviceId, maxHr })
      if (trainerUserId && deviceId) {
        writeRememberedHrDevice(trainerUserId, { deviceId, name: deviceName })
        writeDeviceIdForClient(trainerUserId, id, deviceId)
      }
      setSlots((prev) => {
        const without = prev.filter((s) => s.clientId !== id)
        return [
          ...without,
          {
            clientId: id,
            clientName: String(clientName ?? '').trim() || 'Клиент',
            bpm: null,
            stale: false,
            status: 'live',
            deviceId,
            deviceName,
            error: '',
            zone: null,
            maxHr,
          },
        ].slice(0, HR_MAX_SLOTS)
      })
      setBannerError('')
    },
    [patchSlot, schedulePersist, scopeFor, trainerUserId],
  )

  const connectForClient = useCallback(
    async ({ clientId, clientName, forcePicker = false, maxHr } = {}) => {
      const id = String(clientId ?? '').trim()
      if (!id) return { ok: false, error: 'Нет клиента' }

      if (!isWebBluetoothHrAvailable()) {
        const err = webBluetoothHrUnavailableHint() || 'Этот браузер не поддерживает Bluetooth-пульс'
        setBannerError(err)
        return { ok: false, error: err }
      }

      if (runtimeRef.current.has(id) && !forcePicker) {
        return { ok: true, error: '' }
      }

      if (forcePicker) {
        const cur = runtimeRef.current.get(id)
        if (cur?.deviceId && trainerUserId) {
          removeRememberedHrDevice(trainerUserId, cur.deviceId)
        }
        if (trainerUserId) clearDeviceIdForClient(trainerUserId, id)
        removeSlot(id)
      }

      const liveOthers = [...runtimeRef.current.keys()].filter((cid) => cid !== id)
      if (liveOthers.length >= HR_MAX_SLOTS) {
        const err = 'Сначала отключите один датчик'
        setBannerError(err)
        return { ok: false, error: err }
      }

      const occupiedOthers = slotsRef.current.filter(
        (s) =>
          s.clientId !== id &&
          (s.status === 'live' || s.status === 'connecting' || s.status === 'lost'),
      )
      if (occupiedOthers.length >= HR_MAX_SLOTS) {
        const err = 'Сначала отключите один датчик'
        setBannerError(err)
        return { ok: false, error: err }
      }

      setBannerError('')
      setSlots((prev) => {
        if (prev.some((s) => s.clientId === id)) {
          return prev.map((s) =>
            s.clientId === id
              ? {
                  ...s,
                  status: 'connecting',
                  error: '',
                  stale: false,
                  clientName: String(clientName ?? s.clientName),
                  maxHr: Number(maxHr) > 0 ? Number(maxHr) : s.maxHr,
                }
              : s,
          )
        }
        return [
          ...prev.filter((s) => s.clientId !== id),
          {
            clientId: id,
            clientName: String(clientName ?? '').trim() || 'Клиент',
            bpm: null,
            stale: false,
            status: 'connecting',
            deviceId: '',
            deviceName: '',
            error: '',
            zone: null,
            maxHr: Number(maxHr) > 0 ? Number(maxHr) : DEFAULT_MAX_HR,
          },
        ].slice(0, HR_MAX_SLOTS)
      })

      try {
        const connectedDeviceIds = new Set(
          [...runtimeRef.current.values()].map((r) => r.deviceId).filter(Boolean),
        )
        const attachOpts = { maxHr: Number(maxHr) > 0 ? Number(maxHr) : DEFAULT_MAX_HR }

        if (!forcePicker && canRememberBluetoothDevices()) {
          const preferred = readDeviceIdForClient(trainerUserId, id)
          const tryIds = preferred
            ? [preferred, ...readRememberedHrDevices(trainerUserId).map((d) => d.deviceId)]
            : readRememberedHrDevices(trainerUserId).map((d) => d.deviceId)
          const seen = new Set()
          for (const deviceId of tryIds) {
            if (!deviceId || seen.has(deviceId) || connectedDeviceIds.has(deviceId)) continue
            seen.add(deviceId)
            try {
              const granted = await findGrantedHeartRateDevice(deviceId)
              if (granted) {
                await attachToClient(id, clientName, granted, attachOpts)
                return { ok: true, error: '' }
              }
            } catch {
              /* next */
            }
          }
        }

        const device = await requestHeartRateDeviceWithFallback()
        const did = String(device?.id ?? '')
        if (did && connectedDeviceIds.has(did)) {
          const err = 'Этот датчик уже подключён к другому клиенту'
          setBannerError(err)
          removeSlot(id)
          return { ok: false, error: err }
        }
        await attachToClient(id, clientName, device, attachOpts)
        return { ok: true, error: '' }
      } catch (err) {
        // При ошибке пикера оставляем lost/idle слот если были сэмплы
        const hasSamples = (samplesRef.current.get(id) ?? []).length > 0
        if (hasSamples) {
          setSlots((prev) =>
            prev.map((s) =>
              s.clientId === id ? { ...s, status: 'lost', stale: true, error: humanizeBleHrError(err) } : s,
            ),
          )
        } else {
          removeSlot(id)
        }
        const msg = humanizeBleHrError(err)
        setBannerError(msg)
        return { ok: false, error: msg }
      }
    },
    [attachToClient, removeSlot, trainerUserId],
  )

  const disconnectClient = useCallback(
    (clientId) => {
      const id = String(clientId)
      schedulePersist(id)
      removeSlot(id)
      setBannerError('')
    },
    [removeSlot, schedulePersist],
  )

  const pickOtherForClient = useCallback(
    async ({ clientId, clientName, maxHr }) =>
      connectForClient({ clientId, clientName, forcePicker: true, maxHr }),
    [connectForClient],
  )

  const getSessionSamples = useCallback(
    (clientId) => {
      const id = String(clientId ?? '')
      if (!id) return []
      const tid = scopeFor(id)
      if (!tid) return []
      if (samplesRef.current.has(id)) return samplesRef.current.get(id).slice()
      if (trainerUserId) {
        const fromStore = readHrSamples(trainerUserId, id, tid)
        if (fromStore.length) {
          samplesRef.current.set(id, fromStore)
          return fromStore.slice()
        }
      }
      return []
    },
    [scopeFor, trainerUserId],
  )

  const summarizeSession = useCallback(
    (clientId, ctx = {}) => {
      const samples = getSessionSamples(clientId)
      return buildHrSessionSummary(samples, ctx)
    },
    [getSessionSamples],
  )

  const clearSessionSamples = useCallback(
    (clientId) => {
      const id = String(clientId ?? '')
      if (!id) return
      samplesRef.current.delete(id)
      const tid = scopeFor(id)
      if (trainerUserId) {
        clearLegacyHrSamples(trainerUserId, id)
        if (tid) clearHrSamples(trainerUserId, id, tid)
      }
      setSamplesEpoch((n) => n + 1)
    },
    [scopeFor, trainerUserId],
  )

  const liveCount = slots.filter((s) => s.status === 'live').length

  const value = useMemo(
    () => ({
      slots,
      bannerError,
      clearBannerError: () => setBannerError(''),
      supported: isWebBluetoothHrAvailable(),
      unsupportedHint: webBluetoothHrUnavailableHint(),
      maxSlots: HR_MAX_SLOTS,
      showNames: showHrChipName(liveCount),
      samplesEpoch,
      connectForClient,
      disconnectClient,
      pickOtherForClient,
      getSessionSamples,
      summarizeSession,
      clearSessionSamples,
      bindTrainingScope,
      migrateTrainingScope,
      isConnectedForClient: (clientId) => runtimeRef.current.has(String(clientId)),
      slotForClient: (clientId) => slots.find((s) => s.clientId === String(clientId)) ?? null,
      surname: hrChipSurname,
    }),
    [
      bannerError,
      bindTrainingScope,
      clearSessionSamples,
      connectForClient,
      disconnectClient,
      getSessionSamples,
      liveCount,
      migrateTrainingScope,
      pickOtherForClient,
      samplesEpoch,
      slots,
      summarizeSession,
    ],
  )

  return (
    <HeartRateSessionsContext.Provider value={value}>{children}</HeartRateSessionsContext.Provider>
  )
}

export function useHeartRateSessions() {
  const ctx = useContext(HeartRateSessionsContext)
  if (!ctx) {
    return {
      slots: [],
      bannerError: '',
      clearBannerError: () => {},
      supported: false,
      unsupportedHint: webBluetoothHrUnavailableHint(),
      maxSlots: HR_MAX_SLOTS,
      showNames: false,
      connectForClient: async () => ({ ok: false, error: 'Нет провайдера' }),
      disconnectClient: () => {},
      pickOtherForClient: async () => ({ ok: false, error: 'Нет провайдера' }),
      isConnectedForClient: () => false,
      slotForClient: () => null,
      surname: hrChipSurname,
      samplesEpoch: 0,
      getSessionSamples: () => [],
      summarizeSession: () => null,
      clearSessionSamples: () => {},
      bindTrainingScope: () => {},
      migrateTrainingScope: () => {},
    }
  }
  return ctx
}
