import { useCallback, useState } from 'react'
import { Bell, BellOff, CheckCheck, Pin, PinOff } from 'lucide-react'
import { staffGroupSeenRu } from '../../lib/chat/staffGroupPinCore.js'
import { ChatThreadView } from './ChatThreadView.jsx'
import { StaffGroupReadersSheet } from './StaffGroupReadersSheet.jsx'

const EMPTY_RU = 'Сообщений пока нет. Напишите — увидят все сотрудники клуба.'

/**
 * Лента и поле ввода чата клуба (планшет, админ, телефон тренера). Как в группах Telegram: закреп над лентой,
 * в меню долгого нажатия — «Закрепить» / «Открепить» и у своего сообщения «Прочитали N из M».
 * @param {{ group: ReturnType<typeof import('../../hooks/useStaffGroupThread.js').useStaffGroupThread>, onSubmit?: Function, searchHost?: HTMLElement | null }} props
 */
export function StaffGroupThreadView({ group, onSubmit, searchHost = null }) {
  const { chat, pin, readers } = group
  const [readersOf, setReadersOf] = useState(null)
  const closeReaders = useCallback(() => setReadersOf(null), [])

  const menuActions = (message) => {
    const items = []
    if (message.mine && message.seen) {
      items.push({ key: 'seen', label: staffGroupSeenRu(message.seen), icon: CheckCheck, onSelect: () => setReadersOf(String(message.id)) })
    }
    if (pin.canPin) {
      items.push(
        pin.pinned?.id === String(message.id)
          ? { key: 'unpin', label: 'Открепить', icon: PinOff, onSelect: () => void pin.setPin(null) }
          : { key: 'pin', label: 'Закрепить', icon: Pin, onSelect: () => void pin.setPin(String(message.id)) },
      )
    }
    return items
  }

  return (
    <>
      {pin.error ? (
        <p className="staff-group__pin-error" role="alert">
          {pin.error}
        </p>
      ) : null}
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
        onSubmit={onSubmit ?? chat.submit}
        sending={chat.sending}
        sendError={chat.sendError}
        canWrite={Boolean(chat.meta?.can_write)}
        emptyHint={EMPTY_RU}
        placeholder="Сообщение в чат клуба"
        pinned={pin.pinned}
        onUnpin={pin.canPin ? () => void pin.setPin(null) : undefined}
        menuActions={menuActions}
        searchHost={searchHost}
      />
      <StaffGroupReadersSheet messageId={readersOf} load={readers} onClose={closeReaders} />
    </>
  )
}

/** «Без звука»: без push и без числа на конверте; новое в списке всё равно видно. */
export function StaffGroupMuteButton({ muted, onToggle, error }) {
  const label = muted ? 'Включить уведомления чата клуба' : 'Без звука — не присылать уведомления чата клуба'
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-icon-square btn-touch staff-group__mute${muted ? ' is-muted' : ''}`}
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={label}
      title={error || label}
      data-testid="group-mute"
    >
      {muted ? <BellOff size={20} aria-hidden /> : <Bell size={20} aria-hidden />}
    </button>
  )
}
