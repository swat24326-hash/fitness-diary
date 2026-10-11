import { useState } from 'react'
import { ChatFolders } from './ChatFolders.jsx'

const STORE_KEY = 'fd.chatFolder'

function readSaved() {
  try {
    return sessionStorage.getItem(STORE_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * Папки и содержимое выбранной. Выбор помним до закрытия вкладки — вернулись из диалога в ту же папку.
 * @param {{ folders: Array<{ id: string, label: string, unread: number, node: import('react').ReactNode }> }} props
 */
export function ChatFoldersView({ folders }) {
  const [saved, setSaved] = useState(readSaved)
  const active = folders.find((f) => f.id === saved) ?? folders[0]
  if (!active) return null
  const pick = (id) => {
    setSaved(id)
    try {
      sessionStorage.setItem(STORE_KEY, id)
    } catch {
      /* приватный режим — просто не запомним */
    }
  }
  return (
    <div className="chat-folders-view">
      <ChatFolders folders={folders} active={active.id} onChange={pick} />
      {active.node}
    </div>
  )
}
