/**
 * После успешного create — пуш тренеру. Сбой пуша не отменяет абонемент.
 */
import { isOpenPnkClient } from '../../src/lib/pnk/pnkStagesCore.js'
import { activeSaleClipPackageEnd, buildSaleClipTrainerPush } from '../../src/lib/push/saleClipPushCore.js'
import { isWebPushConfigured, sendPushToUser } from './webPushCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{
 *   trainerId?: unknown,
 *   clip?: object|null,
 *   membership?: object|null,
 *   client?: object|null,
 *   priorMemberships?: object[],
 * }} input
 */
export async function notifyTrainerSaleClipCreated(db, input = {}) {
  const trainerId = String(input.trainerId ?? '').trim()
  if (!trainerId || !isWebPushConfigured()) return { skipped: true }

  const clip = input.clip ?? {}
  const membership = input.membership ?? null
  const push = buildSaleClipTrainerPush({
    clientName: clip.client_name,
    membershipTypeLabel: clip.membership_type_label,
    totalTrainings: membership?.total_trainings ?? clip.total_trainings,
    endDate: membership?.end_date ?? clip.end_date,
    activePackageEnd: activeSaleClipPackageEnd(input.priorMemberships, clip.clip_date, membership?.id),
    wasPnk: isOpenPnkClient(input.client),
  })

  return sendPushToUser(db, trainerId, {
    title: push.title,
    body: push.body,
    url: '/trainer',
    tag: clip.id ? `sale-clip-${clip.id}` : 'sale-clip',
  })
}
