/**
 * Пульс BLE + память датчика на планшете.
 * node scripts/verify-ble-heart-rate.mjs
 */
import {
  humanizeBleHrError,
  parseHeartRateMeasurement,
} from '../src/lib/hr/bleHeartRateCore.js'
import {
  clearRememberedHrDevice,
  parseRememberedHrDevice,
  readRememberedHrDevice,
  rememberedHrDeviceStorageKey,
  writeRememberedHrDevice,
} from '../src/lib/hr/rememberedHrDevice.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

function bytes(...arr) {
  return new Uint8Array(arr)
}

// --- parse ---
{
  const u8 = parseHeartRateMeasurement(bytes(0x00, 72))
  ok(u8?.bpm === 72, 'UINT8 BPM 72')
  ok(u8?.contactDetected === true, 'без contact-флагов — считаем контакт ок')
}

{
  const u16 = parseHeartRateMeasurement(bytes(0x01, 0x2c, 0x01))
  ok(u16?.bpm === 300, 'UINT16 little-endian BPM 300')
}

{
  ok(parseHeartRateMeasurement(bytes(0x00)) === null, 'слишком короткий пакет → null')
  ok(parseHeartRateMeasurement(bytes(0x00, 0)) === null, 'BPM 0 → null')
  ok(parseHeartRateMeasurement(bytes(0x01, 0x2d, 0x01)) === null, 'BPM 301 → null')
}

{
  const view = new DataView(bytes(0x00, 88).buffer)
  ok(parseHeartRateMeasurement(view)?.bpm === 88, 'DataView вход')
}

// --- errors RU ---
{
  const cancel = humanizeBleHrError({ name: 'NotFoundError', message: 'User cancelled' })
  ok(cancel.includes('не выбран'), 'отмена пикера на русском')
  const net = humanizeBleHrError({ name: 'NetworkError', message: 'GATT Error' })
  ok(net.includes('подключить'), 'сеть/GATT на русском')
  const nosup = humanizeBleHrError({ name: 'NotSupportedError', message: 'bluetooth' })
  ok(/не поддерживает|Bluetooth/i.test(nosup), 'нет поддержки на русском')
}

// --- remembered storage ---
{
  ok(
    rememberedHrDeviceStorageKey('u-1') === 'fitness-diary-hr-device-v1:u-1',
    'ключ storage по trainer id',
  )
  ok(parseRememberedHrDevice(null) === null, 'parse null')
  ok(parseRememberedHrDevice('{}') === null, 'parse без deviceId')
  const row = parseRememberedHrDevice({ deviceId: 'dev-a', name: 'Polar H10', savedAt: 10 })
  ok(row?.deviceId === 'dev-a' && row.name === 'Polar H10' && row.savedAt === 10, 'parse ok')
  ok(parseRememberedHrDevice({ deviceId: 'x' })?.name === 'Пульсометр', 'имя по умолчанию')
}

{
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
  }

  ok(readRememberedHrDevice('') === null, 'без userId не читаем')
  writeRememberedHrDevice('trainer-9', { deviceId: 'ble-1', name: 'H9' })
  const got = readRememberedHrDevice('trainer-9')
  ok(got?.deviceId === 'ble-1' && got.name === 'H9' && got.savedAt > 0, 'write + read')
  clearRememberedHrDevice('trainer-9')
  ok(readRememberedHrDevice('trainer-9') === null, 'clear')
}

console.log('verify-ble-heart-rate: all passed')
