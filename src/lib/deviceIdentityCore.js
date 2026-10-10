/**
 * Номер устройства для привязки планшетов тренера (сервер — api/_lib/deviceBindingCore.js).
 * Один на браузер/PWA; живёт в localStorage. Очистили данные сайта → новое устройство, ждёт «Разрешить».
 */
export const DEVICE_ID_STORAGE_KEY = 'fd-device-id'
export const DEVICE_ID_HEADER = 'x-device-id'

export const DEVICE_PENDING_RU =
  'Это устройство ждёт разрешения администратора клуба. Попросите админа нажать «Разрешить» в разделе «Устройства тренеров».'
export const DEVICE_UPDATE_APP_RU = 'Обновите приложение: закройте его и откройте заново, затем войдите.'

/** Ответ сервера о привязке — показать тренеру как есть, без запасных путей входа. */
export function isDeviceBindingMessage(msg) {
  const s = String(msg ?? '')
  return s === DEVICE_PENDING_RU || s === DEVICE_UPDATE_APP_RU
}

/**
 * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void } | null} storage
 * @param {() => string} newId
 */
export function readOrCreateDeviceId(storage, newId) {
  try {
    const saved = storage?.getItem(DEVICE_ID_STORAGE_KEY)
    if (saved && /^[A-Za-z0-9-]{16,64}$/.test(saved)) return saved
    const id = newId()
    storage?.setItem(DEVICE_ID_STORAGE_KEY, id)
    return id
  } catch {
    return newId()
  }
}
