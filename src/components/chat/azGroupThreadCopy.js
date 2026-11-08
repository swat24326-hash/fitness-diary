import { azGroupSeenRu } from '../../lib/chat/azGroupPinCore.js'

export const AZ_GROUP_EMPTY_THREAD_RU = 'Сообщений пока нет. Напишите — увидят инструктор и подопечные.'
export const AZ_GROUP_PLACEHOLDER_RU = 'Сообщение в группу АЗ'

/** Подписи ленты группы АЗ для StaffGroupThreadView. */
export const azGroupThreadCopy = {
  emptyHint: AZ_GROUP_EMPTY_THREAD_RU,
  placeholder: AZ_GROUP_PLACEHOLDER_RU,
  seenRu: azGroupSeenRu,
}

/** «Без звука» в шапке группы АЗ. */
export const azGroupMuteCopy = { chatName: 'группы АЗ', testId: 'az-group-mute' }
