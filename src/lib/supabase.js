import { createClient } from '@supabase/supabase-js'

function readViteEnv(name) {
  const raw = import.meta.env[name]
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

const url = readViteEnv('VITE_SUPABASE_URL') || 'https://YOUR_PROJECT.supabase.co'
const anonKey = readViteEnv('VITE_SUPABASE_ANON_KEY') || 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export function isSupabaseConfigured() {
  if (!url || !anonKey) return false
  if (url.includes('YOUR_PROJECT')) return false
  if (anonKey === 'YOUR_SUPABASE_ANON_KEY') return false
  return true
}