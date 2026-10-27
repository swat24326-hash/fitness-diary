import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, Mail, Megaphone, MessageSquareWarning, UserRound, Users } from 'lucide-react'
import { ChatFolders } from '../../components/chat/ChatFolders.jsx'
import { MessengerBack, MessengerHead, MessengerLayout, MessengerPick } from '../../components/chat/MessengerLayout.jsx'
import { StaffChatPane } from '../../components/chat/StaffChatPane.jsx'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import { StaffGroupPane } from '../../components/chat/StaffGroupPane.jsx'
import { CHAT_FOLDER_ADMIN, CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COLLEAGUES, CHAT_FOLDER_COMPLAINTS } from '../../lib/chat/chatContactsCore.js'
import { useStaffMessengerRefresh } from '../../hooks/useStaffMessengerRefresh.js'
import {
  STAFF_FOLDER_INBOX,
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
import { ClubStoryRail } from '../../components/stories/ClubStoryRail.jsx'

const ICON = {
  [CHAT_FOLDER_CLIENTS]: Users,
  [CHAT_FOLDER_COLLEAGUES]: UserRound,
  [CHAT_FOLDER_ADMIN]: Briefcase,
  [CHAT_FOLDER_COMPLAINTS]: MessageSquareWarning,
  [STAFF_FOLDER_INBOX]: Megaphone,
}

/**
 * «Сообщения клуба» тренера, менеджера, управляющего: папки «Клиенты · Коллеги · Администрация»,
 * последней — «Рассылки», список и открытый диалог или рассылка. Рамка — общая с админом (MessengerLayout).
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
  const { reload: reloadChats } = chats
  const { reload: reloadInbox } = inbox

  useEffect(() => {
    if (!loaded || params.get('folder') === folderId) return
    setParams((p) => staffMessengerParams(p, { folder: folderId }), { replace: true })
  }, [loaded, folderId, params, setParams])

  const reloadAll = useCallback(() => {
    reloadChats()
    reloadInbox()
  }, [reloadChats, reloadInbox])
  useStaffMessengerRefresh(reloadAll)

  const closeHref = href({ close: true })
  const back = <MessengerBack to={closeHref} />

  return (
    <MessengerLayout
      open={Boolean(open)}
      listLabel="Диалоги"
      head={
        <MessengerHead
          icon={Mail}
          title="Сообщения клуба"
          short="Сообщения"
          loading={chats.status === 'loading' || inbox.status === 'loading'}
          onReload={reloadAll}
        />
      }
      folders={
        <>
          <ClubStoryRail />
          <ChatFolders
            folders={folders.map((f) => ({ ...f, icon: ICON[f.id] }))}
            active={folderId}
            onChange={(id) => setParams(staffMessengerParams(params, { folder: id }), { replace: true })}
          />
        </>
      }
      list={<StaffMessengerList key={folderId} folder={folder} chats={chats} inbox={inbox} open={open} href={href} />}
      thread={
        open?.type === 'dm' ? (
          <StaffDmPane key={open.userId} userId={open.userId} onSent={reloadChats} backTo={closeHref} back={back} />
        ) : open?.type === 'group' ? (
          <StaffGroupPane key={open.clubId} clubId={open.clubId} onSent={reloadChats} backTo={closeHref} back={back} />
        ) : open?.type === 'chat' ? (
          <StaffChatPane key={`${open.clientId}:${open.kind}`} clientId={open.clientId} kind={open.kind} onSent={reloadChats} backTo={closeHref} back={back} />
        ) : open?.type === 'item' ? (
          <StaffInboxItemPane key={open.id} id={open.id} back={back} />
        ) : (
          <MessengerPick title="Выберите диалог" hint="Слева — клиенты, коллеги, администрация и рассылки." />
        )
      }
    />
  )
}
