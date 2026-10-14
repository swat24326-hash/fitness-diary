/**
 * Черновик голосового, как в Telegram: ушли из диалога посреди записи или прослушивания — запись ждёт в этом диалоге.
 * Живёт, пока открыто приложение (звук в памяти, не на диске: 5 минут ≈ 2,4 МБ).
 * @type {Map<string, { result: { audio: string, sec: number, wave: number[] }, trim: [number, number], once?: boolean }>}
 */
const drafts = new Map()

export function saveVoiceDraft(key, draft) {
  if (key) drafts.set(key, draft)
}

export function readVoiceDraft(key) {
  return key ? (drafts.get(key) ?? null) : null
}

export function clearVoiceDraft(key) {
  drafts.delete(key)
}
