import { useCallback, useEffect, useState } from 'react'
import { AVATAR_FAILED_RU, AVATAR_OFFLINE_RU } from '../lib/profile/avatarCore.js'

const CACHE_PREFIX = 'fd_my_avatar:'

function readCached(cacheKey) {
  try {
    return localStorage.getItem(CACHE_PREFIX + cacheKey) || null
  } catch {
    return null
  }
}

function writeCached(cacheKey, photo) {
  try {
    if (photo) localStorage.setItem(CACHE_PREFIX + cacheKey, photo)
    else localStorage.removeItem(CACHE_PREFIX + cacheKey)
  } catch {
    /* приватный режим — без кэша */
  }
}

/**
 * Своё фото профиля: последнее известное — сразу из памяти телефона (видно и без сети), затем — с сервера.
 * @param {import('../lib/profile/avatarApi.js').AvatarApi} api — стабильный объект (константа модуля)
 * @param {string} cacheKey — чей кэш на этом устройстве (id пользователя / клиента)
 */
export function useMyAvatar(api, cacheKey) {
  const [state, setState] = useState(() => ({ photo: readCached(cacheKey), ready: false }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const apply = useCallback(
    (next) => {
      writeCached(cacheKey, next?.photo ?? null)
      setState({ photo: next?.photo ?? null, ready: Boolean(next?.ready) })
    },
    [cacheKey],
  )

  useEffect(() => {
    let alive = true
    api.get().then(
      (next) => alive && apply(next),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api, apply])

  const run = async (fn) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(AVATAR_OFFLINE_RU)
      return false
    }
    setBusy(true)
    setError('')
    try {
      apply(await fn())
      return true
    } catch (e) {
      setError(e?.message || AVATAR_FAILED_RU)
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    ...state,
    busy,
    error,
    setError,
    save: (data) => run(() => api.set(data)),
    remove: () => run(() => api.remove()),
  }
}
