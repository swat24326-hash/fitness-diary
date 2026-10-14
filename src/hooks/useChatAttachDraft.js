import { useCallback, useEffect, useRef, useState } from 'react'

/** Сжатие фото — отдельным куском сборки: нужно, только когда человек выбрал файл. */
const loadPrepare = () => import('../lib/chat/chatAttachPrepare.js')

/** Что уходит на сервер: без превью и размера (их сервер считает сам). */
function chatAttachPayload(item) {
  if (item.kind === 'file') return { kind: 'file', data: item.data, name: item.name }
  return { kind: 'photo', data: item.data, w: item.w, h: item.h }
}

/**
 * Вложение в поле ввода до отправки: выбрали фото / PDF (скрепка, вставка, перетаскивание) → ужали → превью с крестиком.
 * payload — что отправить вместе с подписью; clear — после отправки или крестиком.
 */
export function useChatAttachDraft() {
  const [item, setItem] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const itemRef = useRef(null)
  const turnRef = useRef(0)

  const drop = useCallback((next) => {
    if (itemRef.current?.previewUrl) URL.revokeObjectURL(itemRef.current.previewUrl)
    itemRef.current = next
    setItem(next)
  }, [])

  useEffect(() => () => itemRef.current?.previewUrl && URL.revokeObjectURL(itemRef.current.previewUrl), [])

  const pick = useCallback(
    async (file) => {
      const turn = ++turnRef.current
      setBusy(true)
      setError('')
      try {
        const next = await (await loadPrepare()).prepareChatAttach(file)
        if (turn === turnRef.current) drop(next)
        else if (next.previewUrl) URL.revokeObjectURL(next.previewUrl)
      } catch (e) {
        if (turn === turnRef.current) setError(e?.message || 'Файл не подходит')
      } finally {
        if (turn === turnRef.current) setBusy(false)
      }
    },
    [drop],
  )

  const clear = useCallback(() => {
    turnRef.current += 1
    setBusy(false)
    setError('')
    drop(null)
  }, [drop])

  return { item, busy, error, pick, clear, payload: item ? chatAttachPayload(item) : null }
}
