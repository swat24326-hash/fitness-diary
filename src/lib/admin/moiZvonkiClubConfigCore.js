/**
 * Конфиг «Мои Звонки» на клуб (club_iskra_settings.moizvonki) + слияние с env.
 * Секреты не отдаём в UI целиком — только маска / флаг.
 */

/**
 * @typedef {{ apiKey: string, userEmail: string, apiBase: string }} MoiZvonkiConfig
 */

/**
 * @param {string | null | undefined} domainOrBase
 * @returns {string}
 */
export function normalizeMoiZvonkiApiBase(domainOrBase) {
  let raw = String(domainOrBase ?? '')
    .trim()
    .replace(/\/$/, '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  const domain = raw
    .toLowerCase()
    .replace(/\.moizvonki\.ru$/i, '')
    .replace(/^https?:\/\//i, '')
  if (!domain) return ''
  return `https://${domain}.moizvonki.ru/api/v1`
}

/**
 * @param {unknown} raw jsonb из БД
 * @returns {{ apiKey: string, userEmail: string, apiBase: string }}
 */
export function parseStoredMoiZvonkiClubConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { apiKey: '', userEmail: '', apiBase: '' }
  }
  const o = /** @type {Record<string, unknown>} */ (raw)
  const apiKey = String(o.api_key ?? o.apiKey ?? '').trim()
  const userEmail = String(o.user_email ?? o.userEmail ?? '').trim()
  const apiBase = normalizeMoiZvonkiApiBase(
    o.api_base ?? o.apiBase ?? o.domain ?? '',
  )
  return { apiKey, userEmail, apiBase }
}

/** @param {MoiZvonkiConfig | null | undefined} cfg */
export function isMoiZvonkiConfigComplete(cfg) {
  return Boolean(cfg?.apiKey && cfg?.userEmail && cfg?.apiBase)
}

/**
 * Клуб перекрывает env по полям; полный клуб → source club; иначе merge / env / none.
 * @param {{
 *   clubStored?: unknown,
 *   envConfig?: MoiZvonkiConfig | null,
 * }} opts
 * @returns {MoiZvonkiConfig & { source: 'club' | 'env' | 'merge' | 'none' }}
 */
export function resolveMoiZvonkiConfig(opts = {}) {
  const club = parseStoredMoiZvonkiClubConfig(opts.clubStored)
  const env = opts.envConfig ?? { apiKey: '', userEmail: '', apiBase: '' }

  if (isMoiZvonkiConfigComplete(club)) {
    return { ...club, source: 'club' }
  }

  const merged = {
    apiKey: club.apiKey || env.apiKey || '',
    userEmail: club.userEmail || env.userEmail || '',
    apiBase: club.apiBase || env.apiBase || '',
  }

  if (isMoiZvonkiConfigComplete(merged)) {
    const usedClub = Boolean(club.apiKey || club.userEmail || club.apiBase)
    const usedEnv = Boolean(env.apiKey || env.userEmail || env.apiBase)
    return {
      ...merged,
      source: usedClub && usedEnv ? 'merge' : usedClub ? 'club' : 'env',
    }
  }

  return { ...merged, source: 'none' }
}

/**
 * Публичный срез для UI (без секрета).
 * @param {MoiZvonkiConfig & { source?: string }} cfg
 */
export function shapeMoiZvonkiPublicStatus(cfg) {
  const complete = isMoiZvonkiConfigComplete(cfg)
  const email = String(cfg?.userEmail ?? '').trim()
  let emailMasked = ''
  if (email) {
    const at = email.indexOf('@')
    if (at > 1) emailMasked = `${email.slice(0, 1)}***${email.slice(at)}`
    else emailMasked = '***'
  }
  return {
    configured: complete,
    source: complete ? cfg.source || 'club' : 'none',
    user_email_masked: emailMasked || null,
    api_base: complete ? String(cfg.apiBase ?? '').trim() || null : null,
    has_api_key: Boolean(cfg?.apiKey),
  }
}

/**
 * Валидация тела сохранения. Пустой api_key → сохранить без смены ключа (keepExistingKey).
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   patch: { api_key?: string, user_email: string, api_base: string },
 *   clear: boolean,
 * } | { ok: false, error: string }}
 */
export function validateMoiZvonkiClubConfigForSave(body) {
  if (body === null) {
    return { ok: true, patch: { user_email: '', api_base: '' }, clear: true }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Некорректный блок Мои Звонки' }
  }
  const o = /** @type {Record<string, unknown>} */ (body)
  const userEmail = String(o.user_email ?? o.userEmail ?? '').trim()
  const apiBase = normalizeMoiZvonkiApiBase(o.api_base ?? o.apiBase ?? o.domain ?? '')
  const apiKeyRaw = o.api_key ?? o.apiKey
  const apiKeyProvided = Object.prototype.hasOwnProperty.call(o, 'api_key') ||
    Object.prototype.hasOwnProperty.call(o, 'apiKey')
  const apiKey = apiKeyProvided ? String(apiKeyRaw ?? '').trim() : undefined

  if (!userEmail && !apiBase && (apiKey === undefined || apiKey === '')) {
    return { ok: true, patch: { user_email: '', api_base: '' }, clear: true }
  }

  if (!userEmail || !apiBase) {
    return {
      ok: false,
      error: 'Для клуба укажите email Мои Звонки и домен (или полный URL API)',
    }
  }
  if (userEmail.length > 200 || apiBase.length > 300) {
    return { ok: false, error: 'Слишком длинные поля Мои Звонки' }
  }
  if (apiKey !== undefined && apiKey.length > 200) {
    return { ok: false, error: 'Слишком длинный API-ключ' }
  }

  /** @type {{ api_key?: string, user_email: string, api_base: string }} */
  const patch = { user_email: userEmail, api_base: apiBase }
  if (apiKey) patch.api_key = apiKey
  return { ok: true, patch, clear: false }
}

/**
 * Слить patch с уже сохранённым (если ключ не прислали — оставить старый).
 * @param {unknown} existingRaw
 * @param {{ api_key?: string, user_email: string, api_base: string }} patch
 * @param {boolean} clear
 */
export function mergeMoiZvonkiClubConfigForStore(existingRaw, patch, clear) {
  if (clear) return null
  const prev = parseStoredMoiZvonkiClubConfig(existingRaw)
  const apiKey = patch.api_key !== undefined ? patch.api_key : prev.apiKey
  if (!apiKey) {
    return null
  }
  return {
    api_key: apiKey,
    user_email: patch.user_email,
    api_base: patch.api_base,
  }
}
