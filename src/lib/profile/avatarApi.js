/**
 * Своё фото профиля — один контракт для трёх приложений: планшет сотрудника (postMyProfile → /api/me-profile),
 * телефон тренера (coachRequest → /api/coach, поле op), клиент (postClientMe → /api/client-me).
 * Ответ — { photo, ready }; ready=false — хранилище фото на сервере не настроено.
 */

/** @typedef {{ photo: string|null, ready: boolean }} AvatarState */
/** @typedef {{ get: () => Promise<AvatarState>, set: (data: string) => Promise<AvatarState>, remove: () => Promise<AvatarState> }} AvatarApi */

/** @param {(body: { action: string, op: string, data?: string }) => Promise<AvatarState>} post @returns {AvatarApi} */
export function avatarApiOver(post) {
  const call = (action, extra = {}) => post({ action, op: action, ...extra })
  return {
    get: () => call('avatar-get'),
    set: (data) => call('avatar-set', { data }),
    remove: () => call('avatar-delete'),
  }
}
