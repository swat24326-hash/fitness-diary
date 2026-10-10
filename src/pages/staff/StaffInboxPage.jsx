import { Link, useSearchParams } from 'react-router-dom'
import { Mail, RefreshCw, Volume2, VolumeX, WifiOff } from 'lucide-react'
import { InboxItemList } from '../../components/inbox/InboxItemList.jsx'
import { useChatSoundSetting } from '../../hooks/useChatSoundSetting.js'
import { useStaffChats } from '../../hooks/useStaffChat.js'
import { StaffChatList } from './StaffChatList.jsx'
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

function Tabs({ chats }) {
  const tab = (to, label, active) => (
    <Link to={to} replace className={`btn btn-sm btn-touch ${active ? 'btn-primary' : 'btn-secondary'}`} aria-current={active ? 'page' : undefined}>
      {label}
    </Link>
  )
  return (
    <nav className="chat-tabs" aria-label="Разделы сообщений">
      {tab('/messages', 'Рассылки', !chats)}
      {tab('/messages?tab=chats', 'Диалоги с клиентами', chats)}
    </nav>
  )
}

/** /messages — объявления и опросы руководства; вкладка «Диалоги» — переписка с клиентами. */
export function StaffInboxPage() {
  const [params] = useSearchParams()
  const chats = params.get('tab') === 'chats'
  const { items, status, error, reload } = useStaffInbox()
  const chatList = useStaffChats(chats)
  const sound = useChatSoundSetting('staff')
  const SoundIcon = sound.on ? Volume2 : VolumeX
  const loading = chats ? chatList.status === 'loading' : status === 'loading'
  let content
  if (chats) {
    content = <StaffChatList {...chatList} />
  } else if (!items) {
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
          className={`btn btn-icon-square btn-touch ${sound.on ? 'btn-primary' : 'btn-secondary'}`}
          onClick={sound.toggle}
          aria-pressed={sound.on}
          title={sound.on ? 'Звуки сообщений включены' : 'Звуки сообщений выключены'}
          aria-label="Звуки сообщений"
        >
          <SoundIcon size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-icon-square btn-touch"
          onClick={chats ? chatList.reload : reload}
          disabled={loading}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={loading ? 'icon-spin' : undefined} />
        </button>
      </div>
      <Tabs chats={chats} />
      {!chats && items && status === 'error' ? (
        <p className="staff-inbox__error" role="alert">
          {error}
        </p>
      ) : null}
      {content}
    </div>
  )
}
