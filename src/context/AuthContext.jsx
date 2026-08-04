import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  isAuthApiTransportError,
  resolveLoginEmailFromDb,
  signInViaServerApi,
} from '../lib/authSignInService'
import { normalizeLoginInput, trainerLocalEmail } from '../lib/authLoginResolveCore'
import { fetchMyProfileViaApi } from '../lib/profileApiClient'
import { firstSuccessfulPromise, isCloudReachable } from '../lib/networkReachability'
import { withSupabaseRetry } from '../lib/supabaseRetry'
import {
  initConnectivityListeners,
  clearPoisonedSyncQueue,
  clearSyncQueueForSignOut,
  setBackgroundSyncPaused,
} from '../lib/syncService'
import { ensureDemoData, demoTrainerId, DEMO_CLUB_ID } from '../lib/seedDemo'
import {
  clearIdentityCache,
  clearPersistedSupabaseSession,
  hasPersistedSupabaseSession,
  mergeIdentityCacheIntoUser,
  readIdentityCache,
  readIdentityCacheLatest,
  writeIdentityCache,
} from '../lib/userIdentityCache'
import { initAppLifecycle, requestPersistentStorageOnce, APP_WAKE_EVENT } from '../lib/appLifecycle'

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

function applyUserFromSession(session, profile, identityHint) {
  let usesTablet = true
  if (profile && Object.prototype.hasOwnProperty.call(profile, 'uses_tablet')) {
    usesTablet = profile.uses_tablet !== false
  } else if (identityHint && identityHint.uses_tablet !== undefined) {
    usesTablet = identityHint.uses_tablet !== false
  }
  const base = {
    id: session.user.id,
    email: session.user.email,
    name: profile?.name ?? identityHint?.name ?? session.user.email,
    club_id: profile?.club_id ?? identityHint?.club_id ?? null,
    uses_tablet: usesTablet,
  }
  return identityHint ? mergeIdentityCacheIntoUser(identityHint, base) : base
}

function persistIdentity(user, role) {
  if (!user?.id) return
  writeIdentityCache({
    id: user.id,
    email: user.email,
    name: user.name,
    club_id: user.club_id,
    uses_tablet: user.uses_tablet,
    role,
  })
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
  if (r === 'sales_manager' || r === 'менеджер по продажам') return 'sales_manager'
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

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()

function clearRoleCache() {
  try {
    localStorage.removeItem(ROLE_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionRecovering, setSessionRecovering] = useState(false)
  const [profilePending, setProfilePending] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  /** Явный выход: не восстанавливать сессию по остаткам токена / SIGNED_OUT. */
  const signingOutRef = useRef(false)
  const [hasStoredSession, setHasStoredSession] = useState(() =>
    isSupabaseConfigured() ? hasPersistedSupabaseSession(SUPABASE_URL) : false,
  )

  const queryUserRow = useCallback(async (applyFilter) => {
    const fields = 'role, name, email, phone, login, club_id, uses_tablet'
    let q = supabase.from('users').select(fields)
    q = applyFilter(q)
    const { data, error } = await withSupabaseRetry(() => q.maybeSingle())
    if (error) {
      const m = String(error.message ?? '').toLowerCase()
      if (m.includes('uses_tablet')) {
        let q2 = supabase.from('users').select('role, name, email, phone, login, club_id')
        q2 = applyFilter(q2)
        const { data: d2, error: e2 } = await withSupabaseRetry(() => q2.maybeSingle())
        if (e2) {
          const m2 = String(e2.message ?? '').toLowerCase()
          if (m2.includes('club_id')) {
            let q3 = supabase.from('users').select('role, name, email, phone, login')
            q3 = applyFilter(q3)
            const { data: d3, error: e3 } = await withSupabaseRetry(() => q3.maybeSingle())
            if (e3) throw e3
            return d3 ? { ...d3, club_id: null, uses_tablet: true } : null
          }
          throw e2
        }
        return d2 ? { ...d2, uses_tablet: true } : null
      }
      if (m.includes('club_id')) {
        let q2 = supabase.from('users').select('role, name, email, phone, login')
        q2 = applyFilter(q2)
        const { data: d2, error: e2 } = await withSupabaseRetry(() => q2.maybeSingle())
        if (e2) throw e2
        return d2 ? { ...d2, club_id: null, uses_tablet: true } : null
      }
      throw error
    }
    return data ? { ...data, uses_tablet: data.uses_tablet !== false } : null
  }, [])

  const refreshProfile = useCallback(
    async (uid, email) => {
      if (!isSupabaseConfigured() || !uid) return null

      const loadDirect = async () => {
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
      }

      try {
        if (!isCloudReachable()) {
          return await loadDirect()
        }
        return await firstSuccessfulPromise([
          async () => {
            const viaApi = await fetchMyProfileViaApi()
            if (!viaApi.profile) throw viaApi.error ?? new Error('empty profile')
            return viaApi.profile
          },
          loadDirect,
        ])
      } catch (e) {
        const m = String(e?.message ?? '')
        if (!/timeout|таймаут/i.test(m)) {
          console.warn('[auth] profile load failed', e)
        }
        try {
          return await loadDirect()
        } catch {
          return null
        }
      }
    },
    [queryUserRow],
  )

  const applySession = useCallback(
    async (session, { fromWake = false } = {}) => {
      if (signingOutRef.current) return
      if (!session?.user) {
        setUser(null)
        setRole(null)
        setProfilePending(false)
        return
      }
      const uid = session.user.id
      const identityHint = readIdentityCache(uid, session.user.email) ?? readIdentityCacheLatest()
      const quickRole = resolveRole(null, session.user)
      const quickUser = applyUserFromSession(session, null, identityHint)
      setUser(quickUser)
      setRole(identityHint?.role ? normalizeRole(identityHint.role) : quickRole)
      setBackgroundSyncPaused(false)
      setProfilePending(true)

      const profile = await withTimeout(refreshProfile(uid, session.user.email), fromWake ? 12_000 : 8_000, 'profile').catch(
        () => null,
      )
      if (signingOutRef.current) return
      if (!profile) {
        if (identityHint) {
          setUser((prev) => (prev?.id === uid ? mergeIdentityCacheIntoUser(identityHint, prev) : prev))
        }
        setProfilePending(false)
        return
      }
      const nextUser = applyUserFromSession(session, profile, identityHint)
      const nextRole = resolveRole(profile, session.user)
      setUser((prev) => (prev?.id === uid ? nextUser : prev))
      setRole(nextRole)
      persistIdentity(nextUser, nextRole)
      setProfilePending(false)
    },
    [refreshProfile],
  )

  const refreshSessionOnWake = useCallback(async () => {
    if (!isSupabaseConfigured() || signingOutRef.current) return
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.warn('[auth] wake refreshSession', error.message)
        return
      }
      if (signingOutRef.current) return
      if (data?.session?.user) {
        await applySession(data.session, { fromWake: true })
      }
    } catch (e) {
      console.warn('[auth] wake refreshSession failed', e)
    }
  }, [applySession])

  const refreshUserProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return
    setProfilePending(true)
    const profile = await refreshProfile(session.user.id, session.user.email)
    const nextUser = applyUserFromSession(session, profile, readIdentityCache(session.user.id, session.user.email))
    const nextRole = resolveRole(profile, session.user)
    setUser(nextUser)
    setRole(nextRole)
    persistIdentity(nextUser, nextRole)
    setProfilePending(false)
    return profile
  }, [refreshProfile])

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

        const hasStored = hasPersistedSupabaseSession(SUPABASE_URL)
        setHasStoredSession(hasStored)
        if (hasStored) {
          const latest = readIdentityCacheLatest()
          if (latest?.id) {
            setSessionRecovering(true)
            setUser({
              id: latest.id,
              email: latest.email,
              name: latest.name,
              club_id: latest.club_id,
            })
            setRole(normalizeRole(latest.role))
          }
        }

        let session = null
        try {
          const { data } = await withSupabaseRetry(() => withTimeout(supabase.auth.getSession(), 6_000, 'getSession'))
          session = data.session
        } catch (e) {
          console.warn('[auth] getSession failed', e)
          if (hasStored) {
            try {
              const refreshed = await withTimeout(supabase.auth.refreshSession(), 8_000, 'refreshSession')
              session = refreshed.data?.session ?? null
            } catch (e2) {
              console.warn('[auth] refreshSession after getSession fail', e2)
            }
          }
        }

        if (cancelled) return
        if (session?.user) {
          setUser(applyUserFromSession(session, null, readIdentityCache(session.user.id, session.user.email)))
          setRole(resolveRole(null, session.user))
          void applySession(session)
        } else if (!hasStored) {
          setUser(null)
          setRole(null)
        }
      } catch (e) {
        console.warn('[auth] init failed', e)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setSessionRecovering(false)
        }
        window.clearTimeout(loadGuard)
      }

      if (!isSupabaseConfigured() || cancelled) return

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        /* INITIAL_SESSION / TOKEN_REFRESHED — без лишних запросов к REST. */
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        if (session?.user) {
          if (signingOutRef.current) return
          setHasStoredSession(true)
          void applySession(session)
        } else if (event === 'SIGNED_OUT') {
          /* Явный выход: не пытаться «восстановить сессию» по остатку refresh_token. */
          if (signingOutRef.current) {
            clearPersistedSupabaseSession(SUPABASE_URL)
            clearIdentityCache()
            clearRoleCache()
            setHasStoredSession(false)
            setUser(null)
            setRole(null)
            setSessionRecovering(false)
            return
          }
          if (hasPersistedSupabaseSession(SUPABASE_URL)) {
            setSessionRecovering(true)
            void refreshSessionOnWake().finally(() => {
              if (!cancelled) setSessionRecovering(false)
            })
            return
          }
          clearIdentityCache()
          setHasStoredSession(false)
          setUser(null)
          setRole(null)
        }
      })
      authUnsub = () => sub.subscription.unsubscribe()
    })()

    const offLifecycle = initAppLifecycle({
      onLongWake: () => {
        void refreshSessionOnWake()
      },
    })

    return () => {
      cancelled = true
      window.clearTimeout(loadGuard)
      setBackgroundSyncPaused(true)
      off()
      offLifecycle()
      authUnsub?.()
    }
  }, [applySession, refreshSessionOnWake])

  useEffect(() => {
    const onWake = (ev) => {
      if (!ev?.detail?.long || !user?.id) return
      if (user.club_id || role === 'admin') return
      void refreshUserProfile()
    }
    window.addEventListener(APP_WAKE_EVENT, onWake)
    return () => window.removeEventListener(APP_WAKE_EVENT, onWake)
  }, [user?.id, user?.club_id, role, refreshUserProfile])

  const signIn = useCallback(async ({ login, password }) => {
    const raw = normalizeLoginInput(login ?? '')
    if (!raw) return { error: { message: 'Введите логин' } }
    if (password == null || password === '') return { error: { message: 'Введите пароль' } }

    setSigningIn(true)
    signingOutRef.current = false
    const finishSignIn = (authUser, profile) => {
      void clearPoisonedSyncQueue()
      const identityHint = readIdentityCache(authUser.id, authUser.email)
      const nextUser = applyUserFromSession({ user: authUser }, profile, identityHint)
      const nextRole = resolveRole(profile, authUser)
      setUser(nextUser)
      setRole(nextRole)
      persistIdentity(nextUser, nextRole)
      setHasStoredSession(true)
      setBackgroundSyncPaused(false)
      setProfilePending(false)
      void requestPersistentStorageOnce()
      if (!profile?.role && authUser?.id) {
        setProfilePending(true)
        void withTimeout(refreshProfile(authUser.id, authUser.email), 8_000, 'profile')
          .then((p) => {
            if (!p) {
              setProfilePending(false)
              return
            }
            const u = applyUserFromSession({ user: authUser }, p, identityHint)
            setUser((prev) => (prev?.id === authUser.id ? u : prev))
            const r = resolveRole(p, authUser)
            setRole(r)
            persistIdentity(u, r)
            setProfilePending(false)
          })
          .catch(() => setProfilePending(false))
      }
    }

    try {
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

      let serverTransportFailed = false
      try {
        const viaServer = await signInViaServerApi({ login: raw, password })
        if (viaServer.user) {
          finishSignIn(viaServer.user, viaServer.profile ?? null)
          return { error: null }
        }
        if (viaServer.error && !viaServer.transportError && !isAuthApiTransportError(viaServer.error.message)) {
          return { error: { message: viaServer.error.message } }
        }
        if (viaServer.error) {
          serverTransportFailed = Boolean(viaServer.transportError || isAuthApiTransportError(viaServer.error.message))
          console.warn('[auth] /api/auth-sign-in недоступен, пробуем Supabase напрямую', viaServer.error.message)
        }
      } catch (e) {
        if (!isAuthApiTransportError(e?.message)) {
          return { error: { message: humanizeNetworkError(e) } }
        }
        serverTransportFailed = true
        console.warn('[auth] /api/auth-sign-in недоступен, пробуем Supabase напрямую', e)
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
          } else {
            const synth = trainerLocalEmail(raw)
            if (synth) {
              const { data: synthAuth, error: synthErr } = await signInWithPasswordRetry(synth, password)
              if (!synthErr && synthAuth?.user) {
                finishSignIn(synthAuth.user, null)
                return { error: null }
              }
            }
          }
          if (!resolved.email && !emailForAuth.includes('@')) {
            if (serverTransportFailed) {
              return {
                error: {
                  message:
                    'Сервер входа недоступен на этой сети — логин не удалось проверить. Попробуйте другой Wi‑Fi, отключите VPN или войдите по email (например логин@trainer.local).',
                },
              }
            }
            const devHint = import.meta.env.DEV
              ? ' Локально: скопируйте .env с Vercel (как на сайте) или запустите npx vercel dev; можно войти по email.'
              : ' Проверьте раскладку или войдите по email.'
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
      finishSignIn(data.user, null)
      return { error: null }
    } catch (e) {
      return { error: { message: humanizeNetworkError(e) } }
    } finally {
      setSigningIn(false)
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    signingOutRef.current = true
    setBackgroundSyncPaused(true)
    writeFallback(null)
    clearIdentityCache()
    clearRoleCache()
    /* Сначала токены — иначе UI видит hasStoredSession и снова «восстанавливает сессию». */
    if (isSupabaseConfigured()) clearPersistedSupabaseSession(SUPABASE_URL)
    setHasStoredSession(false)
    setUser(null)
    setRole(null)
    setProfilePending(false)
    setSessionRecovering(false)
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch (e) {
        console.warn('[auth] signOut', e)
      }
      clearPersistedSupabaseSession(SUPABASE_URL)
      setHasStoredSession(false)
    }
    /* signingOutRef остаётся true до следующего входа — чтобы поздний wake/refresh не вернул сессию. */
    void clearSyncQueueForSignOut().catch((e) => {
      console.warn('[auth] clear sync queue on signOut', e)
    })
  }, [])

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      sessionRecovering,
      profilePending,
      signingIn,
      signIn,
      signOut,
      refreshUserProfile,
      refreshSessionOnWake,
      hasStoredSession,
      isAdmin: role === 'admin',
      isTrainer: role === 'trainer',
      isSalesManager: role === 'sales_manager',
      supabaseReady: isSupabaseConfigured(),
    }),
    [
      user,
      role,
      loading,
      sessionRecovering,
      profilePending,
      signingIn,
      signIn,
      signOut,
      refreshUserProfile,
      refreshSessionOnWake,
      hasStoredSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
