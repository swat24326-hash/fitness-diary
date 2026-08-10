/**
 * Порт Auth для API: сейчас Supabase; на R2/C2 — свой JWT без смены call-sites.
 * @see docs/AUTH_C2_MAP.md
 */
export {
  adminCreateUserSupabase as adminCreateUser,
  adminDeleteUserSupabase as adminDeleteUser,
  adminUpdatePasswordSupabase as adminUpdatePassword,
  signInWithPasswordSupabase as signInWithPassword,
  verifyBearerSupabase as verifyBearer,
} from './authPortSupabase.js'

/** Сообщение когда не заданы ключи API (Vercel или portable host). */
export const AUTH_ENV_MISSING_RU =
  'На сервере API задайте SUPABASE_SERVICE_ROLE_KEY (и при необходимости SUPABASE_URL / SUPABASE_ANON_KEY), затем перезапустите / Redeploy.'
