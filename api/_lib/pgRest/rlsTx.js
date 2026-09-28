import { getPgRestPool } from './pool.js'

export const RLS_DB_ROLE = 'authenticated'

/**
 * Claims для auth.uid() / auth.jwt() из c2_auth_stub.sql.
 * @param {{ id: string, email?: string }} user
 */
export function buildRlsClaims(user) {
  return {
    sub: String(user.id),
    email: String(user.email ?? ''),
    role: RLS_DB_ROLE,
    aud: RLS_DB_ROLE,
  }
}

/**
 * Запрос браузера под RLS: роль и claims живут только внутри транзакции
 * (set_config(..., true)), соединение возвращается в пул чистым.
 * @param {{ text: string | null, countText: string | null, values: unknown[] }} compiled
 * @param {{ id: string, email?: string }} user
 */
export async function executeCompiledAsUser(compiled, user) {
  const claims = buildRlsClaims(user)
  const client = await getPgRestPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `SELECT set_config('role', $1, true),
              set_config('request.jwt.claims', $2, true),
              set_config('request.jwt.claim.sub', $3, true)`,
      [RLS_DB_ROLE, JSON.stringify(claims), claims.sub],
    )
    let count = null
    if (compiled.countText) {
      const res = await client.query(compiled.countText, compiled.values)
      count = Number(res.rows[0]?._fd_count ?? 0)
    }
    const rows = compiled.text ? (await client.query(compiled.text, compiled.values)).rows : []
    await client.query('COMMIT')
    return { rows, count }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
