/**
 * Самовосстановление подписки при открытии приложения (правила — pushSelfHealCore.js).
 * app: 'staff' — приложение зала, 'coach' — телефон тренера, 'client' — приложение клиента.
 */
import { pushHealDue, pushHealPlan } from './pushSelfHealCore.js'
import { isTrainerPushSupported, serializePushSubscription } from './trainerPushCore.js'
import { subscribePushManager } from './trainerPushSubscribe.js'

const wantKey = (app) => `fd_push_on:${app}`
const healKey = (app) => `fd_push_heal_at:${app}`

function readLs(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLs(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* приватный режим — проверим при следующем открытии */
  }
}

/** Человек включил (true) / выключил (false) уведомления на этом устройстве. */
export function setPushWantOn(app, on) {
  writeLs(wantKey(app), on ? '1' : null)
}

const permissionNow = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission)

async function localSubscription() {
  if (!isTrainerPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

/** Адрес подписки этого телефона ('' — нет). */
export async function currentPushEndpoint() {
  return (await localSubscription())?.endpoint ?? ''
}

/** Не чаще раза в PUSH_HEAL_GAP_MS на приложение. */
export function claimPushHeal(app, now = Date.now()) {
  if (!pushHealDue({ lastAt: readLs(healKey(app)), now })) return false
  writeLs(healKey(app), String(now))
  return true
}

/**
 * Приложение зала: сервер по адресу не спрашиваем — повторная передача подписки безопасна (upsert).
 * @param {{ fetchPublicKey: () => Promise<string>, save: (payload: object) => Promise<unknown> }} api
 */
export async function healStaffPush({ fetchPublicKey, save }) {
  const sub = await localSubscription()
  if (sub) setPushWantOn('staff', true)
  const plan = pushHealPlan({
    supported: isTrainerPushSupported(),
    permission: permissionNow(),
    wantOn: readLs(wantKey('staff')) === '1',
    hasLocal: Boolean(sub),
  })
  if (plan === 'none') return
  const ready = sub ?? (await subscribePushManager(await fetchPublicKey()))
  const ser = serializePushSubscription(ready)
  if (ser.ok) await save(ser.payload)
}

/**
 * Телефон тренера и клиент: сервер отвечает, знает ли он адрес этого телефона.
 * @param {string} app
 * @param {{ fetchStatus: (endpoint: string) => Promise<any>, subscribe: (payload: object) => Promise<unknown> }} api
 * @returns {Promise<{ status: any, endpoint: string }>} статус после починки — для экрана
 */
export async function healEndpointPush(app, { fetchStatus, subscribe }) {
  const endpoint = await currentPushEndpoint().catch(() => '')
  const status = await fetchStatus(endpoint)
  if (status?.subscribed) setPushWantOn(app, true)
  const plan = pushHealPlan({
    supported: isTrainerPushSupported(),
    permission: permissionNow(),
    wantOn: readLs(wantKey(app)) === '1',
    hasLocal: Boolean(endpoint),
    serverSubscribed: Boolean(status?.subscribed),
  })
  if (plan === 'none' || !status?.configured) return { status, endpoint }
  try {
    const ser = serializePushSubscription(await subscribePushManager(status.public_key))
    if (!ser.ok) return { status, endpoint }
    await subscribe(ser.payload)
    return { status: { ...status, subscribed: true }, endpoint: ser.payload.endpoint }
  } catch {
    /* iOS не дал без касания — экран покажет «Включить» */
    return { status, endpoint }
  }
}
