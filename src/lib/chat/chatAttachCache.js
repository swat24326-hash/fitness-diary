/**
 * Скачанные вложения ленты: id сообщения → ссылка на файл в памяти (blob:). Опрос ленты раз в 10 с не качает
 * фото заново; держим последние 30 — старые освобождаем, чтобы длинная переписка не съела память телефона.
 */
const MAX = 30
/** @type {Map<string, Promise<{ url: string, name: string|null, mime: string }>>} */
const cache = new Map()

function toBlob(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * @param {string} id сообщение
 * @param {(id: string) => Promise<{ data: string, mime: string, name?: string|null }>} load
 */
export function loadChatAttach(id, load) {
  const key = String(id)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const p = load(key).then((out) => ({ url: URL.createObjectURL(toBlob(out.data, out.mime)), name: out.name ?? null, mime: out.mime }))
  p.catch(() => cache.get(key) === p && cache.delete(key))
  cache.set(key, p)
  while (cache.size > MAX) {
    const [oldKey, old] = cache.entries().next().value
    cache.delete(oldKey)
    old.then((f) => URL.revokeObjectURL(f.url)).catch(() => {})
  }
  return p
}

/** Скачать файл (PDF или фото) под его именем. */
export function saveChatAttach(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
