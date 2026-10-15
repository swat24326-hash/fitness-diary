/** «Мой профиль» сотрудника открывается не только из бургера: страница «Профиль» тренера просит шапку открыть то же окно. */
export const MY_PROFILE_OPEN_EVENT = 'fd:open-my-profile'

/** Своё фото / статус сменили в одном месте — остальные копии на экране обновляются сразу. */
export const MY_AVATAR_CHANGED_EVENT = 'fd:my-avatar-changed'

export function openMyProfile() {
  window.dispatchEvent(new Event(MY_PROFILE_OPEN_EVENT))
}
