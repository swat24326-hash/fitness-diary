import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import { ChatFolders } from '../../components/chat/ChatFolders.jsx'
import { StaffChatPane } from '../../components/chat/StaffChatPane.jsx'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import { STAFF_INBOX_CHANGED } from '../../lib/inbox/staffInboxApiClient.js'
import { onPushReceived } from '../../lib/push/pushReceivedSignal.js'
import {
  pickStaffFolder,
  staffChatFolders,
  staffFolderOfOpen,
  staffMessengerFolders,
  staffMessengerHref,
  staffMessengerParams,
  staffOpenFromParams,
} from '../../lib/chat/staffMessengerCore.js'
import { StaffInboxItemPane } from './StaffInboxItemPane.jsx'
import { StaffMessengerList } from './StaffMessengerList.jsx'
import '../../styles/staff-messenger.css'

/**
 * «Сообщения клуба» тренера, менеджера, управляющего — как Telegram на планшете: слева папки
 * («Клиенты · Коллеги · Администрация», последней — «Рассылки») и список, справа открытый диалог или рассылка.
 * На телефоне — по одной панели: список → открытое со стрелкой «назад».
 * @param {{ chats: ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats>, inbox: ReturnType<typeof import('./useStaffInbox.js').useStaffInbox> }} props
 */
export function StaffMessenger({ chats, inbox }) {
  const [params, setParams] = useSearchParams()
  const open = staffOpenFromParams(params)
  const inboxUnread = (inbox.items ?? []).filter((it) => it.attention).length
  const folders = staffMessengerFolders(staffChatFolders(chats), inboxUnread)
  const loaded = Boolean(chats.folders) && Boolean(inbox.items)
  const requested = params.get('folder') || staffFolderOfOpen(open)
  const folderId = pickStaffFolder({ requested, folders })
  const folder = folders.find((f) => f.id === folderId)
  const href = (patch) => staffMessengerHref(params, patch)
  const reloadAll = () => {
    chats.reload()
    inbox.reload()
  }
  const { reload: reloadChats } = chats
  const { reload: reloadInbox } = inbox

  useEffect(() => {
    if (!loaded || params.get('folder') === folderId) return
    setParams((p) => staffMessengerParams(p, { folder: folderId }), { replace: true })
  }, [loaded, folderId, params, setParams])

  useEffect(() => {
    const reload = () => {
      reloadChats()
      reloadInbox()
    }
    const offPush = onPushReceived(reload)
    window.addEventListener(STAFF_INBOX_CHANGED, reload)
    return () => {
      offPush()
      window.removeEventListener(STAFF_INBOX_CHANGED, reload)
    }
  }, [reloadChats, reloadInbox])

  const loading = chats.status === 'loading' || inbox.status === 'loading'
  const closeHref = href({ close: true })
  const back = (
    <Link to={closeHref} className="btn btn-ghost btn-sm staff-msgr__back">
      <ArrowLeft size={18} aria-hidden />
      К списку
    </Link>
  )

  return (
    <div className={`staff-msgr${open ? ' staff-msgr--open' : ''}`}>
      <aside className="staff-msgr__side" aria-label="Диалоги">
        <div className="staff-msgr__head">
          <h1 className="staff-inbox__title">
            <Mail size={22} aria-hidden />
            Сообщения клуба
          </h1>
          <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={reloadAll} disabled={loading} title="Обновить" aria-label="Обновить">
            <RefreshCw size={18} aria-hidden className={loading ? 'icon-spin' : undefined} />
          </button>
        </div>
        <ChatFolders folders={folders} active={folderId} onChange={(id) => setParams(staffMessengerParams(params, { folder: id }))} />
        <StaffMessengerList key={folderId} folder={folder} chats={chats} inbox={inbox} open={open} href={href} />
      </aside>

      <main className="staff-msgr__thread">
        {open?.type === 'dm' ? (
          <StaffDmPane key={open.userId} userId={open.userId} onSent={reloadChats} backTo={closeHref} back={back} />
        ) : open?.type === 'chat' ? (
          <StaffChatPane key={`${open.clientId}:${open.kind}`} clientId={open.clientId} kind={open.kind} onSent={reloadChats} backTo={closeHref} back={back} />
        ) : open?.type === 'item' ? (
          <StaffInboxItemPane key={open.id} id={open.id} back={back} />
        ) : (
          <div className="staff-msgr__pick" role="status">
            <MessageCircle size={36} aria-hidden />
            <strong>Выберите диалог</strong>
            <span className="muted">Слева — клиенты, коллеги, администрация и рассылки.</span>
          </div>
        )}
      </main>
    </div>
  )
}
