import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react'
import { messengerColsStyle } from '../../lib/chat/messengerColumnsCore.js'
import { useMessengerColumns } from '../../hooks/useMessengerColumns.js'
import { useMessengerMode } from '../../hooks/useMessengerMode.js'
import { MessengerResizeHandle } from './MessengerResizeHandle.jsx'
import '../../styles/messenger-layout.css'

/**
 * Рамка мессенджера — одна на все роли (админ, управляющий, менеджер, тренер на планшете и телефоне).
 * Вид задаёт экран, не роль: монитор — три колонки (папки · список · диалог, ширину можно подвинуть),
 * планшет — две (папки над списком · диалог), телефон — одна панель и «К списку». Роль решает только содержимое.
 * @param {{ open: boolean, head?: import('react').ReactNode, folders: import('react').ReactNode, list: import('react').ReactNode, thread?: import('react').ReactNode, listLabel: string, compact?: boolean }} props
 * compact — экран сам узкий (телефон тренера /coach): всегда одна панель, диалог — своя страница.
 */
export function MessengerLayout({ open, head = null, folders, list, thread = null, listLabel, compact = false }) {
  const mode = useMessengerMode(compact)
  const { cols, resize, reset } = useMessengerColumns()
  const monitor = mode === 'monitor'
  return (
    <div className={`msgr msgr--${mode}${open ? ' msgr--open' : ''}`} style={monitor ? messengerColsStyle(cols) : undefined}>
      <div className="msgr__side">
        <aside className="msgr__rail">
          {head}
          {folders}
        </aside>
        {monitor ? <MessengerResizeHandle col="rail" label="Ширина папок" onResize={resize} onReset={reset} /> : null}
        <section className="msgr__list" aria-label={listLabel}>
          {list}
        </section>
        {monitor ? <MessengerResizeHandle col="list" label="Ширина списка" onResize={resize} onReset={reset} /> : null}
      </div>
      {thread ? <main className="msgr__thread">{thread}</main> : null}
    </div>
  )
}

/** Заголовок с иконкой и «Обновить». */
export function MessengerHead({ icon: Icon, title, short = title, loading, onReload }) {
  return (
    <div className="msgr__head">
      <h1 className="staff-inbox__title" title={title}>
        <Icon size={22} aria-hidden />
        {short}
      </h1>
      <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={onReload} disabled={loading} title="Обновить" aria-label="Обновить">
        <RefreshCw size={18} aria-hidden className={loading ? 'icon-spin' : undefined} />
      </button>
    </div>
  )
}

/** Справа, пока ничего не открыто. */
export function MessengerPick({ title, hint }) {
  return (
    <div className="msgr__pick" role="status">
      <MessageCircle size={36} aria-hidden />
      <strong>{title}</strong>
      <span className="muted">{hint}</span>
    </div>
  )
}

/** «К списку» — видна только на телефоне, где список и диалог не помещаются рядом. */
export function MessengerBack({ to }) {
  return (
    <Link to={to} className="btn btn-ghost btn-sm msgr__back">
      <ArrowLeft size={18} aria-hidden />
      К списку
    </Link>
  )
}
