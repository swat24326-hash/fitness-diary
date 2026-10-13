import { useState } from 'react'

const STORE_KEY = 'fd.chatFolder'

function readSaved() {
  try {
    return sessionStorage.getItem(STORE_KEY) || ''
  } catch {
    return ''
  }
}

/** Выбранная папка — до закрытия вкладки: вернулись из диалога в ту же папку. */
export function useSavedChatFolder() {
  const [saved, setSaved] = useState(readSaved)
  const pick = (id) => {
    setSaved(id)
    try {
      sessionStorage.setItem(STORE_KEY, id)
    } catch {
      /* приватный режим — просто не запомним */
    }
  }
  return [saved, pick]
}
