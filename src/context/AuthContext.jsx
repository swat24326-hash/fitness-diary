import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { initConnectivityListeners, flushSyncQueue } from '../lib/syncService'
import { ensureDemoData, demoTrainerId, DEMO_CLUB_ID } from '../lib/seedDemo'

const STORAGE_KEY = 'fitness-diary-auth-fallback'

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (uid) => {
    if (!isSupabaseConfigured() || !uid) return null
    try {
      const { data, error } = await supabase.from('users').select('role, name, email, phone, login, club_id').eq('id', uid).maybeSingle()
      if (error) {
        const m = String(error.message ?? '').toLowerCase()
        if (m.includes('club_id')) {
          const { data: d2, error: e2 } = await supabase.from('users').select('role, name, email, phone, login').eq('id', uid).maybeSingle()
          if (e2) throw e2
          return d2 ? { ...d2, club_id: null } : null
        }
        throw error
      }
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const off = initConnectivityListeners()
    let authUnsub

    ;(async () => {
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
        setLoading(false)
        return
      }

      const { data } = await supabase.auth.getSession()
      const s = data.session
      if (s?.user) {
        const profile = await refreshProfile(s.user.id)
        setUser({
          id: s.user.id,
          email: s.user.email,
          name: profile?.name ?? s.user.email,
          club_id: profile?.club_id ?? null,
        })
        setRole(profile?.role ?? 'trainer')
        await flushSyncQueue()
      }
      setLoading(false)

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profile = await refreshProfile(session.user.id)
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: profile?.name ?? session.user.email,
            club_id: profile?.club_id ?? null,
          })
          setRole(profile?.role ?? 'trainer')
          await flushSyncQueue()
        } else {
          setUser(null)
          setRole(null)
        }
      })
      authUnsub = () => sub.subscription.unsubscribe()
    })()

    return () => {
      off()
      authUnsub?.()
    }
  }, [refreshProfile])

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

    let emailForAuth = raw
    if (!raw.includes('@')) {
      try {
        const { data: row, error: qErr } = await supabase.from('users').select('email').eq('login', raw).maybeSingle()
        if (qErr) throw qErr
        if (row?.email) emailForAuth = row.email
        else return { error: { message: 'Пользователь с таким логином не найден' } }
      } catch (e) {
        return { error: { message: e?.message ?? 'Ошибка запроса к базе' } }
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailForAuth, password })
      if (error) return { error }
      const profile = await refreshProfile(data.user.id)
      const r = profile?.role ?? 'trainer'
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: profile?.name ?? data.user.email,
        club_id: profile?.club_id ?? null,
      })
      setRole(r)
      return { error: null }
    } catch (e) {
      return { error: { message: e?.message ?? 'Ошибка входа' } }
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    writeFallback(null)
    setUser(null)
    setRole(null)
    if (isSupabaseConfigured()) await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      signIn,
      signOut,
      isAdmin: role === 'admin',
      isTrainer: role === 'trainer',
      supabaseReady: isSupabaseConfigured(),
    }),
    [user, role, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
