import { useEffect } from 'react'

/** Узел события → элемент. Текст внутри кнопки тапом не приходит, но подстрахуемся. */
function eventTargetElement(target) {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

/**
 * Закрыть всплывашку тапом мимо неё или Escape.
 * Окно «Мой профиль» рисуется порталом в body, вне корня меню. Тап по нему — не «мимо»:
 * иначе меню клиента снимается и уносит окно ещё до «Выбрать фото».
 * @param {boolean} open
 * @param {() => void} close
 * @param {{ current: HTMLElement | null }} rootRef
 */
export function usePopoverDismiss(open, close, rootRef) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      const target = /** @type {Node} */ (e.target)
      if (rootRef.current?.contains(target)) return
      if (eventTargetElement(target)?.closest('.profile-photo-overlay')) return
      close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, rootRef])
}
