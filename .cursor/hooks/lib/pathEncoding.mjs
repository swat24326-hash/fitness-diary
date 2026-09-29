/**
 * Cursor на Windows отдаёт хукам путь с кириллицей испорченным: байты UTF-8
 * прочитаны как Windows-1251 («разработка» → «СЂР°Р·СЂР°Р±РѕС‚РєР°»).
 * С таким путём existsSync ложен, и stop-check молча пропускал eslint.
 * Чистая логика — проверяется scripts/verify-hooks-guards.mjs.
 */

const CP1251_BYTE = (() => {
  const chars = new TextDecoder('windows-1251').decode(Uint8Array.from({ length: 256 }, (_, i) => i))
  return new Map([...chars].map((char, byte) => [char, byte]))
})()

/** @returns {string|null} исправленная строка или null, если это не такая порча */
export function repairUtf8Mojibake(text) {
  const source = String(text || '')
  if (!/[\u0400-\u04ff]/.test(source)) return null

  const bytes = []
  for (const char of source) {
    const byte = CP1251_BYTE.get(char)
    if (byte === undefined) return null
    bytes.push(byte)
  }

  let repaired = ''
  try {
    repaired = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return null
  }
  return repaired === source ? null : repaired
}

/** Путь как есть, если он существует; иначе — восстановленный, если такой файл есть. */
export function resolveHookPath(path, exists) {
  if (exists(path)) return path
  const repaired = repairUtf8Mojibake(path)
  return repaired && exists(repaired) ? repaired : path
}
