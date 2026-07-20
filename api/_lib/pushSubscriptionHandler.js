import { sendJson } from './adminSupabase.js'
import {
  normalizePushSubscribePayload,
  normalizePushUnsubscribePayload,
  normalizeVapidPublicKey,
} from '../../src/lib/push/trainerPushCore.js'
import { isWebPushConfigured, sendPushToUser } from './webPushCore.js'

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handlePushSubscriptionPost(ctx, res, body) {
  const op = String(body?.op ?? 'subscribe').trim().toLowerCase()
  const userId = String(ctx.user?.id ?? '').trim()
  if (!userId) {
    sendJson(res, 401, { error: 'Нет пользователя' })
    return
  }

  if (op === 'unsubscribe') {
    const normalized = normalizePushUnsubscribePayload(body)
    if (!normalized.ok) {
      sendJson(res, 400, { error: normalized.error })
      return
    }
    try {
      const { error } = await ctx.supabaseAdmin
        .from('user_push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', normalized.endpoint)
      if (error) {
        if (/does not exist|relation.*user_push_subscriptions/i.test(String(error.message ?? ''))) {
          sendJson(res, 200, { ok: true, removed: false, migration_pending: true })
          return
        }
        throw error
      }
      sendJson(res, 200, { ok: true, removed: true })
    } catch (e) {
      sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка отписки' })
    }
    return
  }

  if (op === 'test') {
    if (!isWebPushConfigured()) {
      sendJson(res, 400, {
        error: 'Push не настроен на сервере (VAPID ключи). Задания в приложении работают как обычно.',
      })
      return
    }
    try {
      const testUrl = ctx.isSalesManager
        ? '/sales/club-tasks?inbox=1'
        : ctx.isAdmin
          ? '/admin/club-tasks?inbox=1'
          : '/trainer?inbox=1'
      const result = await sendPushToUser(ctx.supabaseAdmin, userId, {
        title: 'Проверка уведомлений',
        body: 'Если видите это — push для Планёрки работает.',
        url: testUrl,
        tag: 'push-test',
      })
      const sent = Number(result.sent ?? 0)
      let reason = String(result.reason ?? '').trim()
      if (!sent && !reason) {
        if (result.skipped) reason = 'skipped'
        else reason = 'no_subscription'
      }
      const messages = {
        no_subscription: 'На сервере нет подписки этого пользователя. Нажмите «Переподключить».',
        send_failed: 'Подписка есть, но отправка не удалась. Разрешите уведомления в браузере и нажмите «Переподключить».',
        not_configured: 'Push не настроен на сервере (VAPID). Задания в Планёрке работают как обычно.',
        migration_pending: 'Таблица подписок ещё не создана. Админу: npm run db:migrate:iskra -- --linked.',
      }
      sendJson(res, 200, {
        ok: true,
        sent,
        reason: reason || undefined,
        message: sent
          ? 'Тестовое уведомление отправлено'
          : messages[reason] || 'Тест не отправился. Нажмите «Переподключить» или см. docs/PUSH_SETUP.md.',
      })
    } catch (e) {
      sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка теста push' })
    }
    return
  }

  const normalized = normalizePushSubscribePayload(body)
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error })
    return
  }

  const p = normalized.payload
  const clubId = p.club_id || String(ctx.user?.club_id ?? '').trim() || null
  const now = new Date().toISOString()

  try {
    const { data, error } = await ctx.supabaseAdmin
      .from('user_push_subscriptions')
      .upsert(
        {
          user_id: userId,
          club_id: clubId,
          endpoint: p.endpoint,
          p256dh: p.p256dh,
          auth: p.auth,
          user_agent: p.user_agent,
          updated_at: now,
        },
        { onConflict: 'user_id,endpoint' },
      )
      .select('id')
      .maybeSingle()

    if (error) {
      if (/does not exist|relation.*user_push_subscriptions/i.test(String(error.message ?? ''))) {
        sendJson(res, 200, { ok: false, stored: false, migration_pending: true })
        return
      }
      throw error
    }

    sendJson(res, 200, {
      ok: true,
      stored: true,
      id: data?.id ?? null,
      push_configured: isWebPushConfigured(),
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения подписки' })
  }
}

/**
 * @param {object} _ctx
 * @param {object} res
 */
export async function handlePushSubscriptionGet(_ctx, res) {
  sendJson(res, 200, {
    ok: true,
    supported: true,
    configured: isWebPushConfigured(),
    public_key: normalizeVapidPublicKey(
      process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '',
    ),
  })
}
