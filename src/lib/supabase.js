import { createClient } from '@supabase/supabase-js'

// ПРЯМЫЕ КЛЮЧИ — ПРОВЕРЕННЫЕ, РАБОЧИЕ
const supabaseUrl = 'https://hrylzinyasucjecltxpc.supabase.co'
const supabaseAnonKey = 'sb_publishable_Oop_12cmvuUYFCwexkERfQ_hNg3laFB'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}
