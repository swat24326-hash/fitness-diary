import { useCallback, useEffect, useRef, useState } from 'react'
import { AVATAR_FAILED_RU, AVATAR_OFFLINE_RU } from '../lib/profile/avatarCore.js'
import { MY_AVATAR_CHANGED_EVENT } from '../lib/profile/myProfileEvents.js'

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
 * Там же свой смайлик-статус (status, setStatus) — только с сервера. Сменили в одном окне — другие копии на экране
 * (строка меню, страница «Профиль» тренера) обновляются сразу.
 * @param {import('../lib/profile/avatarApi.js').AvatarApi} api — стабильный объект (константа модуля)
 * @param {string} cacheKey — чей кэш на этом устройстве (id пользователя / клиента)
 */
export function useMyAvatar(api, cacheKey) {
  const [state, setState] = useState(() => ({ photo: readCached(cacheKey), ready: false, status: null }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const apply = useCallback(
    (next) => {
      writeCached(cacheKey, next?.photo ?? null)
      setState({ photo: next?.photo ?? null, ready: Boolean(next?.ready), status: next?.status ?? null })
    },
    [cacheKey],
  )

  const [attempt, setAttempt] = useState(0)
  /** Шапка живёт весь сеанс: старт был без сети — при открытии профиля спросить сервер ещё раз. */
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  useEffect(() => {
    let alive = true
    api.get().then(
      (next) => alive && apply(next),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api, apply, attempt])

  const self = useRef(null)
  useEffect(() => {
    const onChanged = (e) => {
      const d = e.detail
      if (d?.cacheKey !== cacheKey || d.from === self) return
      setState((s) => ({ ...s, photo: d.photo, status: d.status }))
    }
    window.addEventListener(MY_AVATAR_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(MY_AVATAR_CHANGED_EVENT, onChanged)
  }, [cacheKey])

  const run = async (fn) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(AVATAR_OFFLINE_RU)
      return false
    }
    setBusy(true)
    setError('')
    try {
      const next = await fn()
      apply(next)
      const detail = { cacheKey, from: self, photo: next?.photo ?? null, status: next?.status ?? null }
      window.dispatchEvent(new CustomEvent(MY_AVATAR_CHANGED_EVENT, { detail }))
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
    setStatus: (emoji, duration) => run(() => api.setStatus(emoji, duration)),
    retry,
  }
}
