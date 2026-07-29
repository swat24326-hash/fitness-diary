/**
 * Единый session-кэш для home-glance виджетов (SWR).
 * Detail-экраны (статистика, полный отчёт) этот слой не используют для отказа от сети.
 *
 * @param {{ ns: string, ttlMs: number }} opts
 */
export function createGlanceCache({ ns, ttlMs }) {
  const namespace = String(ns ?? '').trim() || 'glance'
  const ttl = Math.max(0, Number(ttlMs) || 0)
  const PREFIX = `fd-glance:${namespace}:v1:`

  function storageKey(parts) {
    const segs = (Array.isArray(parts) ? parts : [parts])
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
    return `${PREFIX}${segs.join(':')}`
  }

  function read(parts) {
    try {
      if (typeof sessionStorage === 'undefined') return null
      const raw = sessionStorage.getItem(storageKey(parts))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed?.payload == null || typeof parsed.savedAt !== 'number') return null
      return parsed
    } catch {
      return null
    }
  }

  function peek(parts) {
    return read(parts)?.payload ?? null
  }

  function write(parts, payload) {
    try {
      if (typeof sessionStorage === 'undefined' || payload == null) return
      sessionStorage.setItem(
        storageKey(parts),
        JSON.stringify({ payload, savedAt: Date.now() }),
      )
    } catch {
      /* quota */
    }
  }

  function isFresh(savedAt, overrideTtlMs) {
    const t = overrideTtlMs != null ? Number(overrideTtlMs) : ttl
    return typeof savedAt === 'number' && Date.now() - savedAt < t
  }

  /**
   * @param {{ clubId?: string } | string} [scope]
   *   clubId — сбросить ключи клуба; строка — prefix; без аргумента — весь ns
   */
  function invalidate(scope) {
    try {
      if (typeof sessionStorage === 'undefined') return
      let prefix = PREFIX
      if (typeof scope === 'string' && scope.trim()) {
        prefix = scope.startsWith(PREFIX) ? scope : `${PREFIX}${scope.trim()}`
      } else if (scope && typeof scope === 'object' && scope.clubId) {
        prefix = `${PREFIX}${String(scope.clubId).trim()}:`
      }
      const toRemove = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k && k.startsWith(prefix)) toRemove.push(k)
      }
      for (const k of toRemove) sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }

  return {
    ns: namespace,
    ttlMs: ttl,
    key: storageKey,
    read,
    peek,
    write,
    isFresh,
    invalidate,
  }
}

/**
 * Сравнение payload по полям (или shallow JSON).
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @param {string[]} [fields]
 */
export function glancePayloadLooksSame(a, b, fields) {
  if (a === b) return true
  if (!a || !b) return false
  if (Array.isArray(fields) && fields.length) {
    for (const f of fields) {
      const va = a[f]
      const vb = b[f]
      if (typeof va === 'number' || typeof vb === 'number') {
        if ((Number(va) || 0) !== (Number(vb) || 0)) return false
      } else if (Boolean(va) !== Boolean(vb) && (typeof va === 'boolean' || typeof vb === 'boolean')) {
        if (Boolean(va) !== Boolean(vb)) return false
      } else if (String(va ?? '') !== String(vb ?? '')) {
        return false
      }
    }
    return true
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
