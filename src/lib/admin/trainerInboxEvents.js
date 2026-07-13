export const TRAINER_INBOX_OPEN_EVENT = 'fitness-diary:trainer-inbox-open'
export const TRAINER_INBOX_UPDATED_EVENT = 'fitness-diary:trainer-inbox-updated'

export function requestOpenTrainerInbox() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRAINER_INBOX_OPEN_EVENT))
}

export function notifyTrainerInboxUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRAINER_INBOX_UPDATED_EVENT))
}
