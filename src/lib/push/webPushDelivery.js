/**
 * Как доставлять push: все наши уведомления — живые события (сообщение, задание, подтверждение устройства).
 * urgency high — Android в режиме сна (Doze) отдаёт сразу, а не пачкой раз в 15–60 минут.
 * TTL — телефон дольше без сети: старое уведомление не нужно, оно и так видно в приложении.
 */
export const WEB_PUSH_TTL_SEC = 3 * 24 * 60 * 60

export function webPushSendOptions() {
  return { TTL: WEB_PUSH_TTL_SEC, urgency: 'high' }
}
