/**
 * Пульс BLE + память датчиков + правила слотов шапки.
 * node scripts/verify-ble-heart-rate.mjs
 */
import {
  humanizeBleHrError,
  isAppleDeviceWithoutWebBluetooth,
  parseHeartRateMeasurement,
  webBluetoothHrUnavailableHint,
} from '../src/lib/hr/bleHeartRateCore.js'
import {
  HR_MAX_SLOTS,
  canAddHrSlot,
  hasHrSlotForClient,
  hrChipSurname,
  hrChipZoneClass,
  hrConnectProfileHint,
  hrZoneClass,
  showHrChipName,
} from '../src/lib/hr/hrSessionsCore.js'
import {
  clearRememberedHrDevice,
  parseRememberedHrDevice,
  parseRememberedHrDevices,
  readRememberedHrDevice,
  readRememberedHrDevices,
  rememberedHrDeviceStorageKey,
  rememberedHrDevicesStorageKey,
  removeRememberedHrDevice,
  writeRememberedHrDevice,
  writeRememberedHrDevices,
} from '../src/lib/hr/rememberedHrDevice.js'
import {
  clearHrSamples,
  clearLegacyHrSamples,
  hrSamplesStorageKey,
  migrateHrSamplesScope,
  parseHrSamples,
  readHrSamples,
  writeHrSamples,
} from '../src/lib/hr/hrSampleBufferStore.js'
import {
  clearDeviceIdForClient,
  hrClientDeviceMapKey,
  parseHrClientDeviceMap,
  readDeviceIdForClient,
  writeDeviceIdForClient,
} from '../src/lib/hr/hrClientDeviceMap.js'

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
  ok(/не поддерживает|Bluetooth|Android|Apple|iPhone|iPad/i.test(nosup), 'нет поддержки на русском')
}

// --- Apple / unavailable hint ---
{
  ok(
    isAppleDeviceWithoutWebBluetooth({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }) === true,
    'iPhone без BLE',
  )
  ok(
    isAppleDeviceWithoutWebBluetooth({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    }) === true,
    'iPadOS как Mac + touch',
  )
  ok(
    isAppleDeviceWithoutWebBluetooth({
      userAgent: 'Mozilla/5.0 (Linux; Android 13)',
      maxTouchPoints: 5,
    }) === false,
    'Android не Apple',
  )
  const appleHint = webBluetoothHrUnavailableHint({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)',
  })
  // navigator.bluetooth в Node нет → hint не пустой
  ok(appleHint.includes('iPhone') || appleHint.includes('iPad') || appleHint.includes('Android'), 'hint Apple/Android')
}

// --- slots UI rules ---
{
  ok(HR_MAX_SLOTS === 2, 'макс 2 слота')
  ok(showHrChipName(0) === false, '0 слотов — без имени')
  ok(showHrChipName(1) === false, '1 слот — без имени (экономия места)')
  ok(showHrChipName(2) === true, '2 слота — с фамилией')
  ok(canAddHrSlot(0) && canAddHrSlot(1) && !canAddHrSlot(2), 'canAddHrSlot')
  ok(hrChipSurname('Иванов Пётр') === 'Иванов', 'фамилия')
  ok(hrChipSurname('') === 'Клиент', 'пустое имя')
  ok(hasHrSlotForClient([{ clientId: 'a' }], 'a'), 'has slot')
  ok(!hasHrSlotForClient([{ clientId: 'a' }], 'b'), 'no slot')
  ok(hrZoneClass('easy') === 'hr-zone--easy', 'zone easy class')
  ok(hrZoneClass('mid') === 'hr-zone--mid', 'zone mid class')
  ok(hrZoneClass('hard') === 'hr-zone--hard', 'zone hard class')
  ok(hrZoneClass(null) === '', 'zone null class')
  ok(hrChipZoneClass('easy') === hrZoneClass('easy'), 'hrChipZoneClass alias')
  ok(
    hrConnectProfileHint({ birthDate: '1990-01-01', sex: 'male', weightKg: 80 }) === '',
    'profile hint empty when full',
  )
  ok(
    hrConnectProfileHint({}).includes('дату рождения') &&
      hrConnectProfileHint({}).includes('пол') &&
      hrConnectProfileHint({}).includes('вес'),
    'profile hint lists missing',
  )
}

// --- remembered storage ---
{
  ok(
    rememberedHrDevicesStorageKey('u-1') === 'fitness-diary-hr-devices-v2:u-1',
    'ключ v2 storage',
  )
  ok(
    rememberedHrDeviceStorageKey('u-1') === 'fitness-diary-hr-device-v1:u-1',
    'ключ legacy v1',
  )
  ok(parseRememberedHrDevice(null) === null, 'parse null')
  ok(parseRememberedHrDevice('{}') === null, 'parse без deviceId')
  const row = parseRememberedHrDevice({ deviceId: 'dev-a', name: 'Polar H10', savedAt: 10 })
  ok(row?.deviceId === 'dev-a' && row.name === 'Polar H10' && row.savedAt === 10, 'parse ok')
  ok(parseRememberedHrDevice({ deviceId: 'x' })?.name === 'Пульсометр', 'имя по умолчанию')
  const list = parseRememberedHrDevices({
    devices: [
      { deviceId: 'a', name: 'A' },
      { deviceId: 'b', name: 'B' },
      { deviceId: 'c', name: 'C' },
    ],
  })
  ok(list.length === 2 && list[0].deviceId === 'a' && list[1].deviceId === 'b', 'макс 2 в parse list')
  ok(parseRememberedHrDevices({ deviceId: 'legacy' }).length === 1, 'legacy single object')
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
  ok(got?.deviceId === 'ble-1' && got.name === 'H9' && got.savedAt > 0, 'write + read one')
  writeRememberedHrDevice('trainer-9', { deviceId: 'ble-2', name: 'HW807' })
  const two = readRememberedHrDevices('trainer-9')
  ok(two.length === 2 && two[1].deviceId === 'ble-2', 'два датчика в памяти')
  writeRememberedHrDevice('trainer-9', { deviceId: 'ble-3', name: 'X' })
  const capped = readRememberedHrDevices('trainer-9')
  ok(capped.length === 2 && capped[0].deviceId === 'ble-2' && capped[1].deviceId === 'ble-3', 'вытеснение старого')
  removeRememberedHrDevice('trainer-9', 'ble-3')
  ok(readRememberedHrDevices('trainer-9').length === 1, 'remove one')
  clearRememberedHrDevice('trainer-9')
  ok(readRememberedHrDevices('trainer-9').length === 0, 'clear')

  // migrate v1
  mem.set(
    rememberedHrDeviceStorageKey('legacy-u'),
    JSON.stringify({ deviceId: 'old-1', name: 'Old', savedAt: 1 }),
  )
  const migrated = readRememberedHrDevices('legacy-u')
  ok(migrated.length === 1 && migrated[0].deviceId === 'old-1', 'migrate v1 → v2')
  writeRememberedHrDevices('trainer-9', [{ deviceId: 'z', name: 'Z' }])
  ok(readRememberedHrDevices('trainer-9')[0].deviceId === 'z', 'write list')
}

// --- sample buffer (sessionStorage) + client↔device map ---
{
  const mem = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
  }
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
  }

  ok(
    hrSamplesStorageKey('t1', 'c1', 'w1') === 'fitness-diary-hr-samples-v2:t1:c1:w1',
    'samples key v2',
  )
  ok(parseHrSamples('[]').length === 0, 'parse empty samples')
  ok(parseHrSamples([{ t: 1, bpm: 90 }, { t: 2, bpm: 0 }]).length === 1, 'drop bpm 0')
  writeHrSamples('t1', 'c1', 'w1', [
    { t: 1000, bpm: 100 },
    { t: 2000, bpm: 110 },
  ])
  const samples = readHrSamples('t1', 'c1', 'w1')
  ok(samples.length === 2 && samples[1].bpm === 110, 'write/read samples')
  ok(readHrSamples('t1', 'c1', 'w2').length === 0, 'другая тренировка — пусто')
  clearHrSamples('t1', 'c1', 'w1')
  ok(readHrSamples('t1', 'c1', 'w1').length === 0, 'clear samples')

  // legacy v1 не читается как рабочий буфер
  globalThis.sessionStorage.setItem('fitness-diary-hr-samples-v1:t1:c1', JSON.stringify([{ t: 1, bpm: 99 }]))
  ok(readHrSamples('t1', 'c1', 'w1').length === 0, 'legacy v1 не подмешивается')
  clearLegacyHrSamples('t1', 'c1')
  ok(globalThis.sessionStorage.getItem('fitness-diary-hr-samples-v1:t1:c1') == null, 'legacy cleared')

  writeHrSamples('t1', 'c1', 'pending', [{ t: 5, bpm: 120 }])
  migrateHrSamplesScope('t1', 'c1', 'pending', 'real-id')
  ok(readHrSamples('t1', 'c1', 'pending').length === 0, 'migrate: from cleared')
  ok(readHrSamples('t1', 'c1', 'real-id')[0]?.bpm === 120, 'migrate: to has samples')
  clearHrSamples('t1', 'c1', 'real-id')

  // изоляция двух тренировок одного клиента
  writeHrSamples('t1', 'c1', 'w-a', [{ t: 1, bpm: 80 }])
  writeHrSamples('t1', 'c1', 'w-b', [{ t: 1, bpm: 150 }])
  ok(readHrSamples('t1', 'c1', 'w-a')[0].bpm === 80, 'scope A')
  ok(readHrSamples('t1', 'c1', 'w-b')[0].bpm === 150, 'scope B')
  clearHrSamples('t1', 'c1', 'w-a')
  ok(readHrSamples('t1', 'c1', 'w-b')[0].bpm === 150, 'clear A не трогает B')
  clearHrSamples('t1', 'c1', 'w-b')

  // без trainingId — пусто (нельзя читать «общий» хвост)
  ok(readHrSamples('t1', 'c1', '').length === 0, 'пусто без trainingId')
  ok(readHrSamples('t1', 'c1', null).length === 0, 'пусто trainingId null')

  ok(hrClientDeviceMapKey('t1') === 'fitness-diary-hr-client-device-v1:t1', 'client-device key')
  ok(parseHrClientDeviceMap({ a: 'dev' }).a === 'dev', 'parse map')
  writeDeviceIdForClient('t1', 'client-a', 'device-x')
  ok(readDeviceIdForClient('t1', 'client-a') === 'device-x', 'client→device')
  clearDeviceIdForClient('t1', 'client-a')
  ok(readDeviceIdForClient('t1', 'client-a') === null, 'clear client→device')
}

console.log('verify-ble-heart-rate: all passed')
