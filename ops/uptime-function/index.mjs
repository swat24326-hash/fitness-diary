/**
 * Внешняя проверка «прод жив» (docs/RELIABILITY_PLAN.md, 2b): Yandex Cloud Function по таймеру раз в минуту.
 * Ловит то, что сторож на ВМ не видит, — ВМ лежит целиком. Та же логика тревог, что у сторожа (watchdogState).
 * Состояние — uptime-state.json в бакете STATE_BUCKET (токен сервисного аккаунта функции), сообщения — в ВК.
 * Сборка в один файл для редактора консоли: node scripts/build-uptime-function.mjs
 */
import { parseVkPeerIds, sendVkAlert } from '../../api/_lib/opsAlert/vkAlertSend.js'
import { nextWatchdogState } from '../../api/_lib/opsAlert/watchdogState.js'

const S3 = 'https://storage.yandexcloud.net'

async function checkHttp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, detail: e?.name === 'TimeoutError' ? 'нет ответа 10 с' : e?.cause?.code || 'ошибка сети' }
  }
}

export async function handler(_event, context) {
  const target = String(process.env.TARGET_URL ?? '').trim()
  const stateUrl = `${S3}/${process.env.STATE_BUCKET}/uptime-state.json`
  const auth = { 'X-YaCloud-SubjectToken': context?.token?.access_token ?? '' }

  const prevRes = await fetch(stateUrl, { headers: auth })
  const prev = prevRes.ok ? await prevRes.json().catch(() => null) : null
  const { state, messages } = nextWatchdogState(prev, { external: await checkHttp(target) }, Date.now())
  const put = await fetch(stateUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
  if (!put.ok) console.error('uptime: состояние не сохранилось, HTTP', put.status)

  if (messages.length) {
    const host = target ? new URL(target).host : 'прод'
    const result = await sendVkAlert({
      token: process.env.VK_ALERT_TOKEN,
      peerIds: parseVkPeerIds(process.env.VK_ALERT_PEER_IDS),
      text: `Ядро (${host}), проверка снаружи\n${messages.join('\n')}`,
    })
    for (const err of result.errors) console.error('uptime: ВК', err)
  }
  return { statusCode: 200, body: JSON.stringify({ messages }) }
}
