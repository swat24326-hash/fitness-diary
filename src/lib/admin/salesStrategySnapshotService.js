/**
 * Сохранение strategy_snapshot через admin-data sales-plan.
 */

import { isCloudReachable, fetchWithAppTimeout } from '../networkReachability.js'
import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { buildStrategySnapshot } from './salesStrategySnapshotCore.js'

export {
  hydrateStrategyFromPlanRow,
  parseStrategySnapshot,
  renewalsSuggestFromSnapshot,
  topUpPackFromSnapshot,
} from './salesStrategySnapshotCore.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}

/**
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   renewalsSuggest: object,
 *   topUpPack?: object|null,
 * }} opts
 */
export async function saveStrategySnapshotForClub(opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  const year = Number(opts?.year)
  const month = Number(opts?.month)
  if (!clubId || !Number.isFinite(year) || !Number.isFinite(month)) {
    return { ok: false, error: 'Нет club_id / месяца' }
  }
  const built = buildStrategySnapshot({
    year,
    month,
    renewalsSuggest: opts.renewalsSuggest,
    topUpPack: opts.topUpPack,
  })
  if (!built.ok) return built

  const token = await getAccessTokenForAdminApi()
  if (!token) return { ok: false, error: 'Нет сессии — войдите снова' }
  if (!isCloudReachable()) {
    return { ok: false, error: 'Нет сети — снимок Стратегии не сохранён' }
  }

  try {
    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=sales-plan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        club_id: clubId,
        year,
        month,
        scope: 'strategy_snapshot',
        strategy_snapshot: built.snapshot,
      }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      return { ok: false, error: data?.error || `Ошибка сервера (${res.status})` }
    }
    if (!data?.plan) return { ok: false, error: 'Не удалось сохранить снимок' }
    return { ok: true, plan: data.plan, snapshot: built.snapshot }
  } catch (e) {
    return { ok: false, error: e?.message || 'Ошибка сохранения снимка' }
  }
}
