import { useCallback, useState } from 'react'
import { MSGR_COLS_KEY, clampMessengerCol, parseMessengerCols } from '../lib/chat/messengerColumnsCore.js'

function readSaved() {
  try {
    return parseMessengerCols(localStorage.getItem(MSGR_COLS_KEY))
  } catch {
    return parseMessengerCols(null)
  }
}

function save(cols) {
  try {
    localStorage.setItem(MSGR_COLS_KEY, JSON.stringify(cols))
  } catch {
    /* приватный режим — ширина просто не запомнится */
  }
}

/**
 * Ширина колонок «папки» и «список» на мониторе: тянут разделитель — меняется, отпустили — запомнили на этом компьютере.
 * @returns {{ cols: { rail: number | null, list: number | null }, resize: (col: 'rail' | 'list', px: number, commit?: boolean) => void, reset: (col: 'rail' | 'list') => void }}
 */
export function useMessengerColumns() {
  const [cols, setCols] = useState(readSaved)

  const resize = useCallback((col, px, commit = false) => {
    setCols((prev) => {
      const next = { ...prev, [col]: clampMessengerCol(col, px) }
      if (commit) save(next)
      return next
    })
  }, [])

  const reset = useCallback((col) => {
    setCols((prev) => {
      const next = { ...prev, [col]: null }
      save(next)
      return next
    })
  }, [])

  return { cols, resize, reset }
}
