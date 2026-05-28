import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { resolveLoginEmailFromDb, signInViaServerApi } from '../lib/authSignInService'
import { fetchMyProfileViaApi } from '../lib/profileApiClient'
import { withSupabaseRetry } from '../lib/supabaseRetry'
import {
  initConnectivityListeners,
  clearPoisonedSyncQueue,
  clearSyncQueueForSignOut,
  setBackgroundSyncPaused,
} from '../lib/syncService'
import { ensureDemoData, demoTrainerId, DEMO_CLUB_ID } from '../lib/seedDemo'

const STORAGE_KEY = 'fitness-diary-auth-fallback'
const ROLE_CACHE_KEY = 'fitness-diary-role-cache'

function readRoleCache(uid, email) {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    const idOk = uid && o.uid && String(o.uid) === String(uid)
    const em = String(email ?? '').trim().toLowerCase()
    const emOk = em && String(o.email ?? '').trim().toLowerCase() === em
    if (!idOk && !emOk) return null
    return normalizeRole(o.role)
  } catch {
    return null
  }
}

function writeRoleCache(uid, email, role) {
  try {
    localStorage.setItem(
      ROLE_CACHE_KEY,
      JSON.stringify({
        uid: uid ?? null,
        email: email ? String(email).trim().toLowerCase() : null,
        role: normalizeRole(role),
        at: Date.now(),
      }),
    )
  } catch {
    /* ignore */
  }
}

function configuredAdminEmails() {
  const raw = String(import.meta.env.VITE_ADMIN_EMAILS ?? '').trim()
  const fromEnv = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : []
  if (fromEnv.length) return fromEnv
  return ['admin@fit-city.ru']
}

function isConfiguredAdminEmail(email) {
  const em = String(email ?? '').trim().toLowerCase()
  return em && configuredAdminEmails().includes(em)
}

function roleFromAuthUser(authUser) {
  if (!authUser) return null
  const meta = authUser.app_metadata?.role ?? authUser.user_metadata?.role
  if (meta) return normalizeRole(meta)
  return null
}

function resolveRole(profile, sessionUser) {
  if (profile?.role) {
    const r = normalizeRole(profile.role)
    writeRoleCache(sessionUser?.id, sessionUser?.email, r)
    return r
  }
  const fromMeta = roleFromAuthUser(sessionUser)
  if (fromMeta === 'admin') {
    writeRoleCache(sessionUser?.id, sessionUser?.email, 'admin')
    return 'admin'
  }
  if (isConfiguredAdminEmail(sessionUser?.email)) {
    writeRoleCache(sessionUser?.id, sessionUser?.email, 'admin')
    return 'admin'
  }
  const cached = readRoleCache(sessionUser?.id, sessionUser?.email)
  if (cached) return cached
  return 'trainer'
}

function applyUserFromSession(session, profile) {
  return {
    id: session.user.id,
    email: session.user.email,
    name: profile?.name ?? session.user.email,
    club_id: profile?.club_id ?? null,
  }
}

const AuthContext = createContext(null)

function readFallback() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeFallback(session) {
  if (!session) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    }),
  ])
}

function normalizeRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  if (r === 'admin' || r === 'администратор') return 'admin'
  if (r === 'trainer' || r === 'тренер') return 'trainer'
  return 'trainer'
}

function humanizeNetworkError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (/failed to fetch|networkerror|network request failed|connection reset|err_connection|http2_ping|load failed/i.test(msg)) {
    return (
      'Нет стабильной связи с Supabase. Проверьте интернет, отключите VPN и блокировщики. ' +
      'В Яндекс.Браузере инкогнито иногда обрывает запросы — попробуйте обычное окно или Chrome.'
    )
  }
  return msg || 'Ошибка входа'
}

async function signInWithPasswordRetry(email, password, attempts = 2) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return { data, error: null }
      lastError = error
    } catch (e) {
      lastError = e
    }
    const msg = String(lastError?.message ?? lastError ?? '')
    const retryable = /failed to fetch|network|connection reset|err_connection|timeout|load failed/i.test(msg)
    if (!retryable || i === attempts - 1) break
    await new Promise((r) => setTimeout(r, 900 * (i + 1)))
  }
  return { data: null, error: lastError }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const queryUserRow = useCallback(async (applyFilter) => {
    const fields = 'role, name, email, phone, login, club_id'
    let q = supabase.from('users').select(fields)
    q = applyFilter(q)
    const { data, error } = await withSupabaseRetry(() => q.maybeSingle())
    if (error) {
      const m = String(error.message ?? '').toLowerCase()
      if (m.includes('club_id')) {
        let q2 = supabase.from('users').select('role, name, email, phone, login')
        q2 = applyFilter(q2)
        const { data: d2, error: e2 } = await withSupabaseRetry(() => q2.maybeSingle())
        if (e2) throw e2
        return d2 ? { ...d2, club_id: null } : null
      }
      throw error
    }
    return data
  }, [])

  const refreshProfile = useCallback(
    async (uid, email) => {
      if (!isSupabaseConfigured() || !uid) return null
      try {
        const viaApi = await fetchMyProfileViaApi()
        if (viaApi.profile) return viaApi.profile
      } catch {
        /* fallback ниже */
      }
      try {
        let row = await queryUserRow((q) => q.eq('id', uid))
        if (!row?.role && email) {
          const em = String(email).trim().toLowerCase()
          if (em) {
            row = await queryUserRow((q) => q.ilike('email', em))
            if (row && row.id !== uid) {
              console.warn(
                '[auth] public.users.id не совпадает с Auth UID. В Supabase: UPDATE public.users SET id = auth.uid() WHERE email = …',
              )
            }
          }
        }
        return row
      } catch (e) {
        const m = String(e?.message ?? '')
        if (!/timeout/i.test(m)) {
          console.warn('[auth] profile load failed', e)
        }
        return null
      }
    },
    [queryUserRow],
  )

  const applySession = useCallback(
    async (session) => {
      if (!session?.user) {
        setUser(null)
        setRole(null)
        return
      }
      const quickRole = resolveRole(null, session.user)
      setUser(applyUserFromSession(session, null))
      setRole(quickRole)

      await new Promise((r) => setTimeout(r, 350))
      const profile = await withTimeout(refreshProfile(session.user.id, session.user.email), 18_000, 'profile').catch(
        () => null,
      )
      setUser(applyUserFromSession(session, profile))
      setRole(resolveRole(profile, session.user))
      setBackgroundSyncPaused(false)
    },
    [refreshProfile],
  )

  useEffect(() => {
    const off = initConnectivityListeners()
    let authUnsub
    let cancelled = false
    setBackgroundSyncPaused(true)

    /** Экран входа/панели — не дольше ~2 с, даже если auth тормозит. */
    const loadGuard = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 2_000)

    ;(async () => {
      try {
        if (!isSupabaseConfigured()) {
          const fb = readFallback()
          if (fb?.email || fb?.name) {
            setUser({
              id: fb.id ?? 'local-user',
              email: fb.email ?? `${fb.name}@local`,
              name: fb.name ?? fb.email,
              club_id: fb.role === 'admin' ? null : fb.club_id ?? DEMO_CLUB_ID,
            })
            setRole(fb.role ?? 'trainer')
            await ensureDemoData()
          }
          return
        }

        await clearPoisonedSyncQueue()
        if (!cancelled) setLoading(false)

        const { data } = await withSupabaseRetry(() => withTimeout(supabase.auth.getSession(), 6_000, 'getSession'))
        if (cancelled) return
        const s = data.session
        if (s?.user) {
          setUser(applyUserFromSession(s, null))
          setRole(resolveRole(null, s.user))
          await applySession(s)
        }
      } catch (e) {
        console.warn('[auth] init failed', e)
      } finally {
        if (!cancelled) setLoading(false)
        window.clearTimeout(loadGuard)
      }

      if (!isSupabaseConfigured() || cancelled) return

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        /* INITIAL_SESSION / TOKEN_REFRESHED — без лишних запросов к REST. */
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        if (session?.user) {
          void applySession(session)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setRole(null)
        }
      })
      authUnsub = () => sub.subscription.unsubscribe()
    })()

    return () => {
      cancelled = true
      window.clearTimeout(loadGuard)
      setBackgroundSyncPaused(true)
      off()
      authUnsub?.()
    }
  }, [applySession])

  const signIn = useCallback(async ({ login, password }) => {
    const raw = (login ?? '').trim()
    if (!raw) return { error: { message: 'Введите логин' } }
    if (password == null || password === '') return { error: { message: 'Введите пароль' } }

    if (!isSupabaseConfigured()) {
      const lower = raw.toLowerCase()
      const isAdmin = lower === 'admin'
      const id = isAdmin ? crypto.randomUUID() : demoTrainerId
      const email = raw.includes('@') ? raw : `${raw}@local.fitness`
      const session = {
        id,
        email,
        name: raw.includes('@') ? raw.split('@')[0] : raw,
        role: isAdmin ? 'admin' : 'trainer',
        club_id: isAdmin ? null : DEMO_CLUB_ID,
      }
      writeFallback(session)
      setUser({ id, email: session.email, name: session.name, club_id: session.club_id ?? null })
      setRole(session.role)
      await ensureDemoData()
      return { error: null }
    }

    try {
      const viaServer = await signInViaServerApi({ login: raw, password })
      if (viaServer.error) {
        return { error: { message: viaServer.error.message } }
      }
      if (viaServer.user) {
        await clearPoisonedSyncQueue()
        let profile = viaServer.profile
        if (!profile?.role) {
          profile = await withTimeout(
            refreshProfile(viaServer.user.id, viaServer.user.email),
            8_000,
            'profile',
          ).catch(() => profile)
        }
        setUser(applyUserFromSession({ user: viaServer.user }, profile))
        setRole(resolveRole(profile, viaServer.user))
        setBackgroundSyncPaused(false)
        return { error: null }
      }
    } catch (e) {
      return { error: { message: humanizeNetworkError(e) } }
    }

    let emailForAuth = raw
    if (!raw.includes('@')) {
      try {
        const resolved = await withSupabaseRetry(() => resolveLoginEmailFromDb(raw))
        if (resolved.error) throw resolved.error
        if (!resolved.isActive) {
          return { error: { message: 'Учётная запись заблокирована' } }
        }
        if (resolved.email) {
          emailForAuth = resolved.email
        } else if (import.meta.env.DEV) {
          const loginLower = raw.toLowerCase()
          const { data: devAuth, error: devErr } = await signInWithPasswordRetry(
            `${loginLower}@trainer.local`,
            password,
          )
          if (!devErr && devAuth?.user) {
            await clearPoisonedSyncQueue()
            const profile = await withTimeout(
              refreshProfile(devAuth.user.id, devAuth.user.email),
              8_000,
              'profile',
            ).catch(() => null)
            setUser(applyUserFromSession({ user: devAuth.user }, profile))
            setRole(resolveRole(profile, devAuth.user))
            setBackgroundSyncPaused(false)
            return { error: null }
          }
        }
        if (!resolved.email && !emailForAuth.includes('@')) {
          const devHint = import.meta.env.DEV
            ? ' Локально: скопируйте .env с Vercel (как на сайте) или запустите npx vercel dev; можно войти по email.'
            : ''
          return { error: { message: `Пользователь с таким логином не найден.${devHint}` } }
        }
      } catch (e) {
        const msg = humanizeNetworkError(e)
        const devHint = import.meta.env.DEV
          ? ' Локально для входа по логину нужен npx vercel dev или файл .env с ключами Supabase.'
          : ''
        return {
          error: {
            message:
              msg.includes('timeout') || /connection reset|failed to fetch/i.test(msg)
                ? `${msg} Попробуйте Ctrl+F5 — вход через сервер сайта (/api/auth-sign-in).${devHint}`
                : `${msg}${devHint}`,
          },
        }
      }
    }

    try {
      const { data, error } = await signInWithPasswordRetry(emailForAuth, password)
      if (error) {
        const msg = String(error.message ?? '')
        if (/invalid api key/i.test(msg)) {
          return {
            error: {
              message:
                'Неверный ключ Supabase на сервере. В Vercel укажите anon public (eyJ…), не sb_publishable_…, и сделайте Redeploy.',
            },
          }
        }
        return { error: { message: humanizeNetworkError(error) } }
      }
      await clearPoisonedSyncQueue()
      const profile = await withTimeout(refreshProfile(data.user.id, data.user.email), 8_000, 'profile').catch(
        () => null,
      )
      setUser(applyUserFromSession({ user: data.user }, profile))
      setRole(resolveRole(profile, data.user))
      setBackgroundSyncPaused(false)
      return { error: null }
    } catch (e) {
      return { error: { message: humanizeNetworkError(e) } }
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    setBackgroundSyncPaused(true)
    try {
      await clearSyncQueueForSignOut()
    } catch (e) {
      console.warn('[auth] clear sync queue on signOut', e)
    }
    writeFallback(null)
    setUser(null)
    setRole(null)
    if (isSupabaseConfigured()) await supabase.auth.signOut()
  }, [])

  const refreshUserProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return
    const profile = await refreshProfile(session.user.id, session.user.email)
    setUser(applyUserFromSession(session, profile))
    setRole(resolveRole(profile, session.user))
    return profile
  }, [refreshProfile])

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      signIn,
      signOut,
      refreshUserProfile,
      isAdmin: role === 'admin',
      isTrainer: role === 'trainer',
      supabaseReady: isSupabaseConfigured(),
    }),
    [user, role, loading, signIn, signOut, refreshUserProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
