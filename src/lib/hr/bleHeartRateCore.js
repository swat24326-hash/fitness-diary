/**
 * Web Bluetooth Heart Rate (GATT) — чистая логика без React.
 * Живой поток только на устройстве; в Sync не уходит.
 */

export const HR_SERVICE_UUID = 'heart_rate'
export const HR_MEASUREMENT_UUID = 'heart_rate_measurement'

/** Сколько мс без notification считать потерей сигнала. */
export const HR_STALE_MS = 5000

/**
 * Разбор Heart Rate Measurement (Bluetooth SIG).
 * @param {DataView | ArrayBuffer | Uint8Array} data
 * @returns {{ bpm: number, contactSupported: boolean, contactDetected: boolean } | null}
 */
export function parseHeartRateMeasurement(data) {
  const view =
    data instanceof DataView
      ? data
      : new DataView(
          data instanceof ArrayBuffer
            ? data
            : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        )
  if (view.byteLength < 2) return null
  const flags = view.getUint8(0)
  const uint16 = (flags & 0x01) !== 0
  if (uint16 && view.byteLength < 3) return null
  const bpm = uint16 ? view.getUint16(1, true) : view.getUint8(1)
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return null
  const contactSupported = (flags & 0x04) !== 0
  const contactDetected = contactSupported ? (flags & 0x02) !== 0 : true
  return { bpm, contactSupported, contactDetected }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function humanizeBleHrError(err) {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err ?? '')
  if (name === 'NotFoundError' || /no device|cancelled|canceled/i.test(msg)) {
    return 'Датчик не выбран'
  }
  if (name === 'SecurityError' || /secure|https|permission/i.test(msg)) {
    return 'Bluetooth недоступен в этом браузере (нужен Chrome на планшете)'
  }
  if (name === 'NetworkError' || /gatt|connect/i.test(msg)) {
    return 'Не удалось подключить пояс. Включите датчик и поднесите ближе'
  }
  if (name === 'NotSupportedError' || /bluetooth/i.test(msg)) {
    return 'Этот браузер не поддерживает Bluetooth-пульс'
  }
  if (/getDevices|not available/i.test(msg)) {
    return 'Повторное подключение недоступно — выберите датчик заново'
  }
  if (msg && msg.length < 120 && !/^[A-Z][a-z]+Error/.test(msg)) return msg
  return 'Не удалось подключить пульсометр'
}

/**
 * @returns {boolean}
 */
export function isWebBluetoothHrAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth?.requestDevice)
}

/**
 * @returns {boolean}
 */
export function canRememberBluetoothDevices() {
  return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.getDevices === 'function'
}

/**
 * @param {{ optionalServices?: string[], acceptAll?: boolean }} [opts]
 * @returns {Promise<BluetoothDevice>}
 */
export async function requestHeartRateDevice(opts = {}) {
  if (!isWebBluetoothHrAvailable()) {
    const e = new Error('Этот браузер не поддерживает Bluetooth-пульс')
    e.name = 'NotSupportedError'
    throw e
  }
  const optionalServices = opts.optionalServices ?? [HR_SERVICE_UUID]
  if (opts.acceptAll) {
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    })
  }
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [HR_SERVICE_UUID] }],
    optionalServices,
  })
}

/**
 * Сначала фильтр Heart Rate; если список пуст / отмена не помогла — общий список устройств.
 * @param {{ optionalServices?: string[] }} [opts]
 * @returns {Promise<BluetoothDevice>}
 */
export async function requestHeartRateDeviceWithFallback(opts = {}) {
  try {
    return await requestHeartRateDevice({ ...opts, acceptAll: false })
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
    // NotFoundError: нет устройств в фильтре или пользователь закрыл пикер.
    // Пробуем полный список — иначе Cospo/аналоги без UUID в рекламе не видны.
    if (name !== 'NotFoundError') throw err
    return requestHeartRateDevice({ ...opts, acceptAll: true })
  }
}

/**
 * @param {string} deviceId
 * @returns {Promise<BluetoothDevice | null>}
 */
export async function findGrantedHeartRateDevice(deviceId) {
  if (!deviceId || !canRememberBluetoothDevices()) return null
  const list = await navigator.bluetooth.getDevices()
  const id = String(deviceId)
  return list.find((d) => d && String(d.id) === id) ?? null
}

/**
 * Подписка на measurement; возвращает cleanup.
 * @param {BluetoothDevice} device
 * @param {{ onBpm: (bpm: number, meta?: object) => void, onDisconnect?: () => void }} handlers
 * @returns {Promise<{ device: BluetoothDevice, disconnect: () => void }>}
 */
export async function connectHeartRateNotifications(device, handlers) {
  if (!device?.gatt) {
    const e = new Error('Не удалось подключить пояс. Включите датчик и поднесите ближе')
    e.name = 'NetworkError'
    throw e
  }

  const onDisconnect = () => {
    handlers.onDisconnect?.()
  }
  device.addEventListener('gattserverdisconnected', onDisconnect)

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  const service = await server.getPrimaryService(HR_SERVICE_UUID)
  const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID)

  const onCharacteristicValueChanged = (event) => {
    const value = event?.target?.value
    if (!value) return
    const parsed = parseHeartRateMeasurement(value)
    if (!parsed) return
    handlers.onBpm(parsed.bpm, parsed)
  }

  characteristic.addEventListener('characteristicvaluechanged', onCharacteristicValueChanged)
  await characteristic.startNotifications()

  let closed = false
  const disconnect = () => {
    if (closed) return
    closed = true
    try {
      characteristic.removeEventListener('characteristicvaluechanged', onCharacteristicValueChanged)
    } catch {
      /* ignore */
    }
    try {
      device.removeEventListener('gattserverdisconnected', onDisconnect)
    } catch {
      /* ignore */
    }
    try {
      if (device.gatt?.connected) device.gatt.disconnect()
    } catch {
      /* ignore */
    }
  }

  return { device, disconnect }
}
