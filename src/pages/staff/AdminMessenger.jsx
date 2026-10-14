import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Inbox, Mail, RefreshCw, Search, Users, WifiOff } from 'lucide-react'
import { AdminStaffList } from '../../components/chat/AdminStaffList.jsx'
import { ChatFolders } from '../../components/chat/ChatFolders.jsx'
import { MessengerBack, MessengerHead, MessengerLayout, MessengerPick } from '../../components/chat/MessengerLayout.jsx'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import {
  STAFF_VIEW_ALL,
  STAFF_VIEW_UNREAD,
  buildStaffColumns,
  pickStaffSections,
  staffClubRail,
  staffColumnsFoundRu,
} from '../../lib/chat/staffColumnsCore.js'
import { useStaffMessengerRefresh } from '../../hooks/useStaffMessengerRefresh.js'
import '../../styles/admin-messenger.css'

const EMPTY_RU = { [STAFF_VIEW_UNREAD]: 'Все ответили — новых нет' }
const ICON = { [STAFF_VIEW_ALL]: Users, [STAFF_VIEW_UNREAD]: Inbox }

/**
 * Главный админ: папки — клубы («Все клубы», «Ждут ответа», каждый клуб с числом новых), в списке люди с поиском,
 * справа диалог. Рамка — общая с тренером и управляющим (MessengerLayout), вид по ширине экрана.
 * Состояние в адресе (?view=клуб&dm=человек) — назад/вперёд браузера и push `/messages/dm/:id` открывают то же.
 * &text= — готовый текст в поле (центр сбоев «Написать тренеру»).
 * @param {{ chatList: ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats> }} props
 */
export function AdminMessenger({ chatList }) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const dm = params.get('dm') ?? ''
  const view = params.get('view') || STAFF_VIEW_ALL
  const searching = Boolean(query.trim())
  const { folders, status, error, reload } = chatList

  useStaffMessengerRefresh(reload)

  const contacts = (folders ?? []).flatMap((f) => f.contacts)
  const columns = buildStaffColumns(contacts, query)
  const rail = staffClubRail(buildStaffColumns(contacts))
  const sections = pickStaffSections(columns, view, searching)
  const current = rail.find((r) => r.key === view) ?? rail[0]

  const hrefWith = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    return `/messages?${next}`
  }
  const pickView = (key) => {
    setQuery('')
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (key === STAFF_VIEW_ALL) next.delete('view')
      else next.set('view', key)
      return next
    })
  }

  return (
    <MessengerLayout
      open={Boolean(dm)}
      listLabel="Сотрудники"
      head={<MessengerHead icon={Mail} title="Сообщения сотрудников" short="Сотрудники" loading={status === 'loading'} onReload={reload} />}
      folders={
        folders ? (
          <ChatFolders
            label="Клубы"
            testId="staff-clubs"
            folders={rail.map((it, i) => ({ id: it.key, label: it.title, unread: it.unread, count: it.total, icon: ICON[it.key] ?? Building2, sep: i === 1 }))}
            active={searching ? '' : current.key}
            onChange={pickView}
          />
        ) : null
      }
      list={
        <>
          <label className="chat-contacts__search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Клуб или сотрудник"
              aria-label="Найти клуб или сотрудника"
              enterKeyHint="search"
            />
          </label>
          <p className="admin-msgr__list-meta muted" role="status">
            {searching ? staffColumnsFoundRu(columns) : `${current.title} · ${current.total}`}
          </p>
          {!folders ? (
            <div className="msgr__status" role="status">
              {status === 'error' ? <WifiOff size={24} aria-hidden /> : <RefreshCw size={24} aria-hidden className="icon-spin" />}
              <span>{status === 'error' ? error || 'Не загрузилось — проверьте интернет' : 'Загружаем…'}</span>
            </div>
          ) : (
            <AdminStaffList
              sections={sections}
              searching={searching}
              hrefFor={(id) => hrefWith({ dm: id, text: '' })}
              selectedId={dm}
              emptyText={searching ? 'Никого не нашли' : EMPTY_RU[view] || 'Пока никого нет'}
            />
          )}
        </>
      }
      thread={
        dm ? (
          <StaffDmPane
            key={dm}
            userId={dm}
            onSent={reload}
            initialDraft={params.get('text') ?? ''}
            backTo={hrefWith({ dm: '', text: '' })}
            back={<MessengerBack to={hrefWith({ dm: '', text: '' })} />}
          />
        ) : (
          <MessengerPick title="Выберите, кому написать" hint="Клуб слева, человек в списке — или найдите по имени." />
        )
      }
    />
  )
}
