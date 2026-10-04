import { isIamTokenFresh, YANDEX_METADATA_TOKEN_URL } from './iskraLlmCore.js'

/** @type {{ token: string, expiresAt: number } | null} */
let iamCache = null

function authError(message) {
  const err = new Error(message)
  err.status = 401
  return err
}

/** IAM-токен сервисного аккаунта ВМ Yandex Cloud (модели AI Studio и SpeechKit). */
export async function metadataIamToken() {
  if (isIamTokenFresh(iamCache, Date.now())) return iamCache.token
  let data
  try {
    const res = await fetch(YANDEX_METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw authError(`metadata token HTTP ${res.status}`)
    data = await res.json()
  } catch (e) {
    throw e?.status === 401 ? e : authError('нет токена сервисного аккаунта ВМ')
  }
  const ttlSec = Number(data?.expires_in) || 3600
  iamCache = { token: String(data?.access_token ?? ''), expiresAt: Date.now() + ttlSec * 1000 }
  return iamCache.token
}
