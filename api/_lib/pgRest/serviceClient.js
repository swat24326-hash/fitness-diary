import { createClient } from '@supabase/supabase-js'
import { isPgDataBackend } from './backend.js'
import { createPgRestClient } from './query.js'

export { isPgDataBackend, pgDataBackendEnvError } from './backend.js'

function supabaseServiceEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return { url, serviceKey }
}

const AUTH_STEP_RU = 'DATA_BACKEND=pg: свой Auth ещё не включён (шаг 2 волны 2).'

function missingAuthAdmin() {
  const fail = async () => ({ data: { user: null }, error: { message: AUTH_STEP_RU } })
  return { createUser: fail, updateUserById: fail, deleteUser: fail }
}

/** Пока шаг 2 не включён, `.auth.admin` остаётся Supabase — иначе создание тренера падает. */
function attachTransitionalAuth(client) {
  let cached = null
  client.auth = {
    get admin() {
      const { url, serviceKey } = supabaseServiceEnv()
      if (!url || !serviceKey) return missingAuthAdmin()
      if (!cached) cached = createClient(url, serviceKey)
      return cached.auth.admin
    },
  }
  return client
}

/**
 * Тот же объект, что раньше давал `createClient` service role.
 * При `DATA_BACKEND=pg` данные идут в Postgres; без флага — как раньше, в Supabase.
 * @param {object} [supabaseOpts] опции supabase-js (таймаут fetch). На pg не используются.
 */
export function createServiceDataClient(supabaseOpts) {
  if (!isPgDataBackend()) {
    const { url, serviceKey } = supabaseServiceEnv()
    return createClient(url, serviceKey, supabaseOpts)
  }
  return attachTransitionalAuth(createPgRestClient())
}
