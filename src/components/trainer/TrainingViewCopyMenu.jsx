import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Menu } from 'lucide-react'
import { buildClientTrainingCopyText } from '../../lib/client/clientTrainingCopyCore.js'

/**
 * Тихий бургер в шапке просмотра тренировки клиента: «Скопировать» → текст в буфер (для Whoop и др.).
 * @param {{ training: object }} props
 */
export function TrainingViewCopyMenu({ training }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(/** @type {'' | 'ok' | 'empty' | 'fail'} */ (''))
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!status) return undefined
    const id = window.setTimeout(() => setStatus(''), 2200)
    return () => window.clearTimeout(id)
  }, [status])

  const onCopy = async () => {
    const text = buildClientTrainingCopyText(training)
    if (!text) {
      setStatus('empty')
      setOpen(false)
      return
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setStatus('ok')
      setOpen(false)
    } catch {
      setStatus('fail')
      setOpen(false)
    }
  }

  return (
    <div className="training-view__menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-icon-square btn-secondary btn-touch"
        title="Ещё"
        aria-label="Ещё"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Menu size={20} aria-hidden />
      </button>
      {open ? (
        <div className="training-view__menu-panel" role="menu" aria-label="Действия с тренировкой">
          <button type="button" className="training-view__menu-item" role="menuitem" onClick={() => void onCopy()}>
            <Copy size={16} aria-hidden />
            Скопировать
          </button>
        </div>
      ) : null}
      {status === 'ok' ? (
        <p className="training-view__menu-toast" role="status">
          <Check size={14} aria-hidden /> Скопировано — можно вставить в Whoop
        </p>
      ) : null}
      {status === 'empty' ? (
        <p className="training-view__menu-toast training-view__menu-toast--warn" role="status">
          В тренировке нет упражнений для копирования
        </p>
      ) : null}
      {status === 'fail' ? (
        <p className="training-view__menu-toast training-view__menu-toast--warn" role="status">
          Не удалось скопировать — разрешите доступ к буферу
        </p>
      ) : null}
    </div>
  )
}
