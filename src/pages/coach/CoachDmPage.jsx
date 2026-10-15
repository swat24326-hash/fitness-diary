import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { useChatThread } from '../../hooks/useChatThread.js'
import { coachDmVoice, fetchCoachDmThread, reactCoachDmMessage, searchCoachDm, sendCoachDmMessage } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { STAFF_DM_READ_ONLY_RU } from '../../lib/chat/chatUiCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'

/** /coach/dm/:userId — переписка с коллегой или администрацией; сюда же ведёт push о личном сообщении. */
export function CoachDmPage() {
  const { userId = '' } = useParams()
  const { onSessionGone } = useCoachApp()
  const load = useCallback((before, opts) => fetchCoachDmThread(userId, before, opts?.seen), [userId])
  const send = useCallback((outgoing) => sendCoachDmMessage(userId, outgoing), [userId])
  const react = useCallback((messageId, emoji) => reactCoachDmMessage(userId, messageId, emoji), [userId])
  const search = useCallback((q) => searchCoachDm(userId, q), [userId])
  const voice = useMemo(() => coachDmVoice(userId), [userId])
  const chat = useChatThread({ key: `dm:${userId}`, side: 'staff', load, send, react, search, voice })
  const peer = chat.meta?.peer
  const [searchHost, setSearchHost] = useState(null)

  useEffect(() => {
    if ((chat.status === 'error' || chat.sendError) && !hasCoachSession()) onSessionGone(chat.error || chat.sendError)
  }, [chat.status, chat.error, chat.sendError, onSessionGone])

  return (
    <CoachShell
      tabs={false}
      bar={
        <ChatHeadBar
          back={<MessengerBack to="/coach/chats" />}
          icon={MessageCircle}
          photo={peer?.photo}
          status={peer?.status}
          title={peer?.name || 'Сотрудник'}
          subtitle={peer?.label || ''}
          searchHostRef={setSearchHost}
        />
      }
    >
      {!chat.messages ? (
        <CoachLoadState
          status={chat.status}
          error={chat.error}
          action={<ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo="/coach/chats" />}
        />
      ) : (
        <ChatThreadView
          onAtBottom={chat.onAtBottom}
          onReact={chat.react}
          reply={chat.reply}
          search={chat.search}
          voice={chat.voice}
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={chat.meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(chat.meta?.can_write)}
          readOnlyHint={STAFF_DM_READ_ONLY_RU}
          emptyHint={`Сообщений пока нет. ${peer?.label ? `${peer.label} увидит` : 'Собеседник увидит'} ваше сообщение в приложении клуба.`}
          placeholder="Сообщение"
          searchHost={searchHost}
        />
      )}
    </CoachShell>
  )
}
