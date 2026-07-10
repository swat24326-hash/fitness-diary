export const PAGE = 400
export const IN_CHUNK = 80
export const CLIENT_BRIEF = 'id, name, phone, email, trainer_id, club_id, card_number'
export const TRAINER_ROLES = ['trainer', 'тренер']
export const MAX_JOURNAL_PAGE = 100

export function escapeForIlike(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}
