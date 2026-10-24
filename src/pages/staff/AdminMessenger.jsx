import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Inbox, Mail, MessagesSquare, RefreshCw, Search, Users, WifiOff } from 'lucide-react'
import { AdminGroupList } from '../../components/chat/AdminGroupList.jsx'
import { AdminStaffList } from '../../components/chat/AdminStaffList.jsx'
import { ChatFolders } from '../../components/chat/ChatFolders.jsx'
import { MessengerBack, MessengerHead, MessengerLayout, MessengerPick } from '../../components/chat/MessengerLayout.jsx'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import { StaffGroupPane } from '../../components/chat/StaffGroupPane.jsx'
import {
  STAFF_VIEW_ALL,
  STAFF_VIEW_UNREAD,
  buildStaffColumns,
  pickStaffSections,
  staffClubRail,
  staffColumnsFoundRu,
} from '../../lib/chat/staffColumnsCore.js'
import { STAFF_VIEW_GROUPS, staffGroupsRailItem } from '../../lib/chat/staffGroupCore.js'
import { useStaffMessengerRefresh } from '../../hooks/useStaffMessengerRefresh.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { readLastAdminClub } from '../../lib/clubContext.js'
import { storyUuid } from '../../lib/stories/storyClubCore.js'
import { ClubStoryRail } from '../../components/stories/ClubStoryRail.jsx'
import '../../styles/admin-messenger.css'

const EMPTY_RU = { [STAFF_VIEW_UNREAD]: 'Все ответили — новых нет' }
const ICON = { [STAFF_VIEW_ALL]: Users, [STAFF_VIEW_UNREAD]: Inbox, [STAFF_VIEW_GROUPS]: MessagesSquare }

/**
 * Главный админ: папки — клубы («Все клубы», «Ждут ответа», «Чаты клубов», каждый клуб с числом новых), в списке люди с поиском,
 * справа диалог. Рамка — общая с тренером и управляющим (MessengerLayout), вид по ширине экрана.
 * Состояние в адресе (?view=клуб&dm=человек | group=клуб) — назад/вперёд браузера и push `/messages/dm/:id` открывают то же.
 * &text= — готовый текст в поле (центр сбоев «Написать тренеру»).
 * @param {{ chatList: ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats> }} props
 */
export function AdminMessenger({ chatList }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const dm = params.get('dm') ?? ''
  const group = dm ? '' : params.get('group') ?? ''
  const view = params.get('view') || (group ? STAFF_VIEW_GROUPS : STAFF_VIEW_ALL)
  const searching = Boolean(query.trim())
  const { folders, groups = [], status, error, reload } = chatList

  useStaffMessengerRefresh(reload)

  const contacts = (folders ?? []).flatMap((f) => f.contacts)
  const columns = buildStaffColumns(contacts, query)
  const clubs = staffClubRail(buildStaffColumns(contacts))
  const rail = groups.length ? [...clubs.slice(0, 2), staffGroupsRailItem(groups), ...clubs.slice(2)] : clubs
  const sepAt = groups.length ? 2 : 1
  const showGroups = view === STAFF_VIEW_GROUPS && !searching
  const sections = pickStaffSections(columns, view, searching)
  const current = rail.find((r) => r.key === view) ?? rail[0]

  const hrefWith = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    return `/messages?${next}`
  }
  const closeHref = hrefWith({ dm: '', group: '', text: '' })
  const pickView = (key) => {
    setQuery('')
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (key === STAFF_VIEW_ALL) next.delete('view')
      else next.set('view', key)
      return next
    }, { replace: true })
  }

  return (
    <MessengerLayout
      open={Boolean(dm || group)}
      listLabel="Сотрудники"
      head={<MessengerHead icon={Mail} title="Сообщения сотрудников" short="Сотрудники" loading={status === 'loading'} onReload={reload} />}
      folders={
        folders ? (
          <ChatFolders
            label="Клубы"
            testId="staff-clubs"
            folders={rail.map((it, i) => ({ id: it.key, label: it.title, unread: it.unread, count: it.total, icon: ICON[it.key] ?? Building2, sep: i === sepAt }))}
            active={searching ? '' : current.key}
            onChange={pickView}
          />
        ) : null
      }
      list={
        <>
          <ClubStoryRail clubId={storyUuid(view) ? view : readLastAdminClub(user?.id)} />
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
          ) : showGroups ? (
            <AdminGroupList groups={groups} hrefFor={(id) => hrefWith({ group: id, dm: '', text: '' })} selectedId={group} />
          ) : (
            <AdminStaffList
              sections={sections}
              searching={searching}
              hrefFor={(id) => hrefWith({ dm: id, group: '', text: '' })}
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
            backTo={closeHref}
            back={<MessengerBack to={closeHref} />}
          />
        ) : group ? (
          <StaffGroupPane key={group} clubId={group} onSent={reload} backTo={closeHref} back={<MessengerBack to={closeHref} />} />
        ) : (
          <MessengerPick title="Выберите, кому написать" hint="Клуб слева, человек в списке — или найдите по имени." />
        )
      }
    />
  )
}
