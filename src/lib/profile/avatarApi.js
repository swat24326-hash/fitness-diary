/**
 * Своё фото профиля — один контракт для трёх приложений: планшет сотрудника (postMyProfile → /api/me-profile),
 * телефон тренера (coachRequest → /api/coach, поле op), клиент (postClientMe → /api/client-me).
 * Ответ — { photo, ready, status }; ready=false — хранилище фото на сервере не настроено; status — свой смайлик
 * рядом с именем { emoji, until } или null (profileStatusCore.js).
 */

/** @typedef {{ photo: string|null, ready: boolean, status?: { emoji: string, until: string|null } | null }} AvatarState */
/** @typedef {{ get: () => Promise<AvatarState>, set: (data: string) => Promise<AvatarState>, remove: () => Promise<AvatarState>,
 *   setStatus: (emoji: string|null, duration?: string) => Promise<AvatarState> }} AvatarApi */

/** @param {(body: { action: string, op: string, data?: string }) => Promise<AvatarState>} post @returns {AvatarApi} */
export function avatarApiOver(post) {
  const call = (action, extra = {}) => post({ action, op: action, ...extra })
  return {
    get: () => call('avatar-get'),
    set: (data) => call('avatar-set', { data }),
    remove: () => call('avatar-delete'),
    setStatus: (emoji, duration) => call('avatar-status', { emoji, duration }),
  }
}
