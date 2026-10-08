/** «Входящие» клиента: POST /api/client-me { action: 'inbox-*' }. Только при сети — ответ пишет сервер. */
import { postClientMe } from './clientSession.js'

export async function fetchClientInbox() {
  const data = await postClientMe({ action: 'inbox-list' })
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    attention: Number(data?.attention) || 0,
    points: Number(data?.points) || 0,
  }
}

/** Открыть сообщение — сервер заодно отмечает его прочитанным. */
export async function fetchClientInboxItem(id) {
  const data = await postClientMe({ action: 'inbox-item', id })
  return data.item
}

export async function answerClientInboxSurvey(id, answers) {
  const data = await postClientMe({ action: 'inbox-answer', id, answers })
  return data.item
}
