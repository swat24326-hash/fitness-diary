import { Mail, RefreshCw, WifiOff } from 'lucide-react'
import { InboxItemList } from '../../components/inbox/InboxItemList.jsx'
import { useStaffInbox } from './useStaffInbox.js'

function Status({ icon: Icon, title, hint, spin = false }) {
  return (
    <div className="card staff-inbox__status" role="status">
      <Icon size={28} aria-hidden className={spin ? 'icon-spin' : undefined} />
      <strong>{title}</strong>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  )
}

/** /messages — объявления и опросы от администратора и управляющего клуба. */
export function StaffInboxPage() {
  const { items, status, error, reload } = useStaffInbox()
  let content
  if (!items) {
    content =
      status === 'error' ? (
        <Status icon={WifiOff} title="Не загрузилось" hint={error || 'Проверьте интернет и обновите.'} />
      ) : (
        <Status icon={RefreshCw} spin title="Загружаем…" />
      )
  } else if (!items.length) {
    content = <Status icon={Mail} title="Пока пусто" hint="Здесь появятся объявления и опросы от руководства клуба." />
  } else {
    content = <InboxItemList items={items} basePath="/messages" />
  }

  return (
    <div className="staff-inbox">
      <div className="staff-inbox__head">
        <h1 className="staff-inbox__title">
          <Mail size={22} aria-hidden />
          Сообщения клуба
        </h1>
        <button
          type="button"
          className="btn btn-secondary btn-icon-square btn-touch"
          onClick={reload}
          disabled={status === 'loading'}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={status === 'loading' ? 'icon-spin' : undefined} />
        </button>
      </div>
      {items && status === 'error' ? (
        <p className="staff-inbox__error" role="alert">
          {error}
        </p>
      ) : null}
      {content}
    </div>
  )
}
