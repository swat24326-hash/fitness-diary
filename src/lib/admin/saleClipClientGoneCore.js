/**
 * Заявка на абон (sale_clips) после удаления клиента.
 * В облаке client_id обнуляется (ON DELETE SET NULL), статус awaiting остаётся.
 * Планшет потом пишет старый client_id обратно — Postgres отвечает 400
 * sale_clips_client_id_fkey, и Sync крутится.
 */

/**
 * @param {string} message
 */
export function isSaleClipMissingLinkFkError(message) {
  const msg = String(message ?? '').toLowerCase()
  return msg.includes('sale_clips_client_id_fkey') || msg.includes('sale_clips_membership_id_fkey')
}

/**
 * Клиента уже нет: нельзя возвращать его id в заявку.
 * «Готово» без карточки — ложь, абонемент уехал вместе с клиентом. Заявку снимаем.
 * @param {object | null | undefined} payload
 * @param {string} [nowIso]
 */
export function saleClipPushWhenClientMissing(payload, nowIso) {
  const prev = payload && typeof payload === 'object' ? payload : {}
  const prevNote = String(prev.note ?? '').trim()
  const reason = 'Клиент удалён — заявка снята'
  const note = prevNote.includes(reason) ? prevNote : [prevNote, reason].filter(Boolean).join(' · ')
  return {
    ...prev,
    client_id: null,
    membership_id: null,
    status: 'cancelled',
    done_at: null,
    note: note.slice(0, 500),
    updated_at: nowIso || new Date().toISOString(),
  }
}

/**
 * Awaiting-заявки этого клиента → отмена без мёртвого client_id.
 * Уже закрытые (done) не переписываем.
 * @param {object[]} clips
 * @param {string} clientId
 * @param {string} [nowIso]
 */
export function planSaleClipCancelsForDeletedClient(clips, clientId, nowIso) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const now = nowIso || new Date().toISOString()
  const out = []
  for (const clip of clips ?? []) {
    if (String(clip?.client_id ?? '').trim() !== cid) continue
    const status = String(clip?.status ?? 'awaiting').trim()
    if (status === 'cancelled' || status === 'done') continue
    const id = String(clip?.id ?? '').trim()
    if (!id) continue
    out.push(saleClipPushWhenClientMissing(clip, now))
  }
  return out
}
