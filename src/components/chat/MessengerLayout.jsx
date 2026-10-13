import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react'
import '../../styles/messenger-layout.css'

/**
 * Рамка мессенджера сотрудников — одна на все роли, вид задаёт ширина экрана, не роль:
 * монитор — три колонки (папки · список · диалог), планшет — две (папки над списком · диалог),
 * телефон — одна панель и «К списку». Роль решает только, что лежит в папках и списке.
 * @param {{ open: boolean, head: import('react').ReactNode, folders: import('react').ReactNode, list: import('react').ReactNode, thread: import('react').ReactNode, listLabel: string }} props
 */
export function MessengerLayout({ open, head, folders, list, thread, listLabel }) {
  return (
    <div className={`msgr${open ? ' msgr--open' : ''}`}>
      <div className="msgr__side">
        <aside className="msgr__rail">
          {head}
          {folders}
        </aside>
        <section className="msgr__list" aria-label={listLabel}>
          {list}
        </section>
      </div>
      <main className="msgr__thread">{thread}</main>
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
