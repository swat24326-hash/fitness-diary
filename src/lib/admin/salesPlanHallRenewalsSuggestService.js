/**
 * Загрузка клиентов/абонов/прайсов для ориентира продлений ПЗ·ТЗ·АЗ.
 */

import { todayLocalIso } from '../dateRu.js'
import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient.js'
import { fetchPriceListForClub } from '../priceList/priceListCloudService.js'
import { fetchTzPriceListForClub } from '../priceList/tzPriceListCloudService.js'
import { fetchAzPriceListForClub } from '../priceList/azPriceListCloudService.js'
import {
  buildHallRenewalsSuggest,
  clampPurchaseHistoryDepth,
  clampRenewalPct,
  resolveHallRenewalsAsOfIso,
  resolveTargetPlanMonthForHorizon,
} from './salesPlanHallRenewalsSuggestCore.js'

/**
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   horizon: 'current' | 'next' | string,
 *   todayIso?: string,
 *   renewalPct?: unknown,
 *   historyDepth?: unknown,
 *   monthDays?: object[],
 * }} opts
 */
export async function loadHallRenewalsSuggestForClub(opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  if (!clubId) return { ok: false, error: 'Не выбран клуб' }

  const todayIso = opts?.todayIso || todayLocalIso()
  const target = resolveTargetPlanMonthForHorizon(opts?.horizon, todayIso)
  if (!target) return { ok: false, error: 'Не удалось определить месяц плана для горизонта' }

  const asOfResolved = resolveHallRenewalsAsOfIso({
    horizon: target.horizon,
    year: target.year,
    month: target.month,
    todayIso,
  })
  if (!asOfResolved.ok) return { ok: false, error: asOfResolved.error }

  const { asOfIso, horizon } = asOfResolved
  const renewalPct = clampRenewalPct(opts?.renewalPct)
  const historyDepth = clampPurchaseHistoryDepth(opts?.historyDepth)

  const [memRes, clientsRes, pzPrice, tzPrice, azPrice] = await Promise.all([
    fetchMembershipsForClubViaAdminApi(clubId),
    fetchClientsForClubViaAdminApi(clubId).catch(() => null),
    fetchPriceListForClub(clubId, { force: true }).catch(() => null),
    fetchTzPriceListForClub(clubId, { force: true }).catch(() => null),
    fetchAzPriceListForClub(clubId, { force: true }).catch(() => null),
  ])

  if (memRes == null) {
    return { ok: false, error: 'Не удалось загрузить абонементы клуба (нужна сессия админа)' }
  }
  if (clientsRes == null) {
    return { ok: false, error: 'Не удалось загрузить клиентов клуба' }
  }

  const memberships = memRes.memberships ?? []
  const clients = clientsRes.clients ?? []

  const suggest = buildHallRenewalsSuggest({
    clients,
    memberships,
    year: target.year,
    month: target.month,
    horizon,
    renewalPct,
    historyDepth,
    asOfIso,
    pzPriceListDoc: pzPrice?.doc ?? null,
    tzPriceListDoc: tzPrice?.doc ?? null,
    azPriceListDoc: azPrice?.doc ?? null,
  })

  if (!suggest.ok) {
    return {
      ok: false,
      error: suggest.error || 'Не удалось посчитать ориентир',
      suggest,
      asOfIso,
      horizon,
      target,
      renewalPct,
      historyDepth,
    }
  }

  return {
    ok: true,
    suggest,
    asOfIso,
    horizon,
    target,
    renewalPct,
    historyDepth,
    membershipCount: memberships.length,
    truncated: Boolean(memRes.truncated),
  }
}
