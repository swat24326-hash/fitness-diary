/**
 * Совмещённые роли в переписке (service role). Правило связи — src/lib/chat/linkedStaffCore.js.
 * До миграции 20261014120000_users_linked_user.sql колонки нет — связей просто нет, переписка работает как раньше.
 */
import {
  hiddenLinkedTrainerIds,
  isLinkedPair,
  linkedSupervisorFor,
  linkedTrainerRecipientIds,
} from '../../../src/lib/chat/linkedStaffCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { loadStaffThreads } from './chatStore.js'

export const LINK_FIELDS = 'id, name, role, club_id, is_active, linked_user_id'

export function isMissingLinkColumn(e) {
  return /linked_user_id/.test(String(e?.message ?? '')) && /does not exist|column/i.test(String(e?.message ?? ''))
}

async function orEmpty(fn) {
  try {
    return await fn()
  } catch (e) {
    if (isMissingLinkColumn(e)) return []
    throw e
  }
}

function loadUsers(db, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return Promise.resolve([])
  return orEmpty(() => loadInChunks(unique, (part) => rows(db.from('users').select(LINK_FIELDS).in('id', part))))
}

/** Две учётки одного человека (тренер + управляющий): переписка между ними — разговор с самим собой. */
export async function isLinkedPairIds(db, aId, bId) {
  const users = await loadUsers(db, [aId, bId])
  const byId = new Map(users.map((u) => [String(u.id), u]))
  return isLinkedPair(byId.get(String(aId)), byId.get(String(bId)))
}

/** Контекст сотрудника как у requireAuthUser, но за управляющего. Только для переписки. */
function supervisorCtx(ctx, sup) {
  return {
    supabaseAdmin: ctx.supabaseAdmin,
    user: { id: String(sup.id), email: '' },
    profile: sup,
    roleNorm: 'supervisor',
    isAdmin: false,
    isTrainer: false,
    isSalesManager: false,
    isSupervisor: true,
    linkedFrom: String(ctx.user?.id ?? ''),
  }
}

const memo = new WeakMap()

/**
 * Тренерская учётка, связанная с управляющим → контекст управляющего; иначе null.
 * Связь сверяется на каждый запрос (одна выборка на запрос): сняли связь или заблокировали — действует сразу.
 */
export function linkedSupervisorCtx(ctx) {
  if (!ctx?.isTrainer || ctx.isAdmin) return Promise.resolve(null)
  if (!memo.has(ctx)) {
    memo.set(
      ctx,
      (async () => {
        const db = ctx.supabaseAdmin
        const [me] = await loadUsers(db, [ctx.user?.id])
        if (!me?.linked_user_id) return null
        const [linked] = await loadUsers(db, [me.linked_user_id])
        const sup = linkedSupervisorFor(me, linked ?? null)
        return sup ? supervisorCtx(ctx, sup) : null
      })(),
    )
  }
  return memo.get(ctx)
}

/** Личная переписка связанной пары идёт от учётки управляющего — для коллег человек один. */
export async function staffDmCtx(ctx) {
  return (await linkedSupervisorCtx(ctx)) ?? ctx
}

/** «Жалобы и предложения» клуба для связанной тренерской учётки; actor — от чьего имени проверять доступ. */
export async function linkedComplaintThreads(ctx) {
  const sup = await linkedSupervisorCtx(ctx)
  if (!sup) return []
  const scope = { role: 'supervisor', userId: sup.user.id, clubId: String(sup.profile.club_id), kinds: ['supervisor'] }
  return (await loadStaffThreads(ctx.supabaseAdmin, scope)).map((t) => ({ ...t, actor: sup }))
}

/** Тренерские учётки связанных пар клуба — не показываем коллегам вторым человеком. */
export async function loadHiddenLinkedTrainers(db, clubId) {
  const linked = await orEmpty(() =>
    rows(db.from('users').select(LINK_FIELDS).eq('club_id', clubId).not('linked_user_id', 'is', null)),
  )
  return hiddenLinkedTrainerIds(linked)
}

/** Получатели push + тренерские учётки получателей-управляющих. */
export async function withLinkedTrainers(db, userIds) {
  const base = [...new Set(userIds.map(String))]
  const recipients = await loadUsers(db, base)
  const linked = await loadUsers(
    db,
    recipients.map((r) => r.linked_user_id),
  )
  return [...new Set([...base, ...linkedTrainerRecipientIds(recipients, linked)])]
}
