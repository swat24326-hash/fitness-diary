/**
 * Загрузка данных для ориентира плана ПЗ ДК (прайс + абонементы клуба).
 */

import { todayLocalIso } from '../dateRu.js'
import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient.js'
import { fetchPriceListForClub } from '../priceList/priceListCloudService.js'
import {
  buildPzDkPlanSuggest,
  clampRenewalPct,
  refinePzDkSuggestForPlan,
  resolvePzDkSuggestAsOfIso,
  resolveTargetPlanMonthForHorizon,
  sumFactPzDkCountFromDailyRows,
} from './salesPlanPzDkSuggestCore.js'

/**
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   membershipTypes?: object[],
 *   horizon: 'current' | 'next' | string,
 *   todayIso?: string,
 *   renewalPct?: unknown,
 *   monthDays?: object[],
 * }} opts
 */
export async function loadPzDkPlanSuggestForClub(opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  if (!clubId) return { ok: false, error: 'Не выбран клуб' }

  const todayIso = opts?.todayIso || todayLocalIso()
  const target = resolveTargetPlanMonthForHorizon(opts?.horizon, todayIso)
  if (!target) return { ok: false, error: 'Не удалось определить месяц плана для горизонта' }

  const asOfResolved = resolvePzDkSuggestAsOfIso({
    horizon: target.horizon,
    year: target.year,
    month: target.month,
    todayIso,
  })
  if (!asOfResolved.ok) return { ok: false, error: asOfResolved.error }

  const { asOfIso, horizon } = asOfResolved
  const renewalPct = clampRenewalPct(opts?.renewalPct)

  const [priceRes, memRes, clientsRes] = await Promise.all([
    fetchPriceListForClub(clubId, { force: true }),
    fetchMembershipsForClubViaAdminApi(clubId),
    fetchClientsForClubViaAdminApi(clubId).catch(() => null),
  ])

  const priceDoc = priceRes?.doc
  if (!priceDoc?.tariffs?.length && !Object.keys(priceDoc?.cells ?? {}).length) {
    return {
      ok: false,
      error: priceRes?.error || 'Прайс ПЗ пуст — откройте вкладку «Прайс», заполните пакет 8 тр. и сохраните',
    }
  }

  if (memRes == null) {
    return { ok: false, error: 'Не удалось загрузить абонементы клуба (нужна сессия админа)' }
  }

  const memberships = memRes.memberships ?? []
  const clients = clientsRes?.clients ?? []

  let suggest = buildPzDkPlanSuggest({
    priceListDoc: priceDoc,
    membershipTypes: opts?.membershipTypes ?? [],
    memberships,
    clients,
    asOfIso,
    horizon,
  })

  const factPzDkCount =
    horizon === 'current' ? sumFactPzDkCountFromDailyRows(opts?.monthDays) : 0

  if (suggest.ok) {
    suggest = refinePzDkSuggestForPlan(suggest, {
      renewalPct,
      factPzDkCount,
      horizon,
    })
  }

  if (!suggest.ok) {
    return {
      ok: false,
      error: suggest.error || 'Не удалось посчитать ориентир',
      suggest,
      asOfIso,
      horizon,
      target,
      renewalPct,
      factPzDkCount,
    }
  }

  return {
    ok: true,
    suggest,
    asOfIso,
    horizon,
    target,
    renewalPct,
    factPzDkCount,
    membershipCount: memberships.length,
    truncated: Boolean(memRes.truncated),
  }
}
