import { createClient } from '@supabase/supabase-js'

function readViteEnv(name) {
  const raw = import.meta.env[name]
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

/** Пустая строка из Vercel env не должна ломать createClient — только валидный https://… */
function isValidSupabaseUrl(url) {
  if (!url || url.includes('YOUR_PROJECT')) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

const urlFromEnv = readViteEnv('VITE_SUPABASE_URL')
const anonKeyFromEnv = readViteEnv('VITE_SUPABASE_ANON_KEY')

/** @returns {'ok'|'missing'|'bad_url'|'missing_key'|'publishable_key'|'bad_key'} */
export function getSupabaseConfigStatus() {
  if (!urlFromEnv && !anonKeyFromEnv) return 'missing'
  if (!isValidSupabaseUrl(urlFromEnv)) return 'bad_url'
  if (!anonKeyFromEnv || anonKeyFromEnv === 'YOUR_SUPABASE_ANON_KEY') return 'missing_key'
  if (anonKeyFromEnv.startsWith('sb_publishable_')) return 'publishable_key'
  if (!anonKeyFromEnv.startsWith('eyJ')) return 'bad_key'
  return 'ok'
}

/** Сообщение для экрана входа, если в сборку попал неверный ключ. */
export function getSupabaseSetupMessage() {
  switch (getSupabaseConfigStatus()) {
    case 'publishable_key':
      return (
        'Указан ключ sb_publishable_… — с REST API он не работает (401). ' +
        'В Vercel и в .env замените VITE_SUPABASE_ANON_KEY на anon public из Supabase → Settings → API (JWT, начинается с eyJ…), затем Redeploy.'
      )
    case 'bad_key':
      return 'VITE_SUPABASE_ANON_KEY должен быть anon public (JWT eyJ…). Проверьте переменные в Vercel и пересоберите проект.'
    case 'bad_url':
      return 'Некорректный VITE_SUPABASE_URL. Укажите Project URL из Supabase → Settings → API.'
    case 'missing_key':
      return 'Не задан VITE_SUPABASE_ANON_KEY. Добавьте anon public (eyJ…) в Vercel → Environment Variables и сделайте Redeploy.'
    case 'missing':
      return null
    default:
      return null
  }
}

export function isSupabaseConfigured() {
  return getSupabaseConfigStatus() === 'ok'
}

/** Заглушка только чтобы createClient не падал при невалидном env; запросы не делаем, если !isSupabaseConfigured() */
const url = isSupabaseConfigured() ? urlFromEnv : 'https://placeholder.supabase.co'
const anonKey = isSupabaseConfigured()
  ? anonKeyFromEnv
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    /* StrictMode в dev дергает auth дважды → lock 5s и медленный вход */
    lockAcquireTimeout: 1500,
  },
})
