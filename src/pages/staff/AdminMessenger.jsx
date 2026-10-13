import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mail, MessageCircle, RefreshCw, Search, WifiOff } from 'lucide-react'
import { AdminClubRail } from '../../components/chat/AdminClubRail.jsx'
import { AdminStaffList } from '../../components/chat/AdminStaffList.jsx'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import {
  STAFF_VIEW_ALL,
  STAFF_VIEW_UNREAD,
  buildStaffColumns,
  pickStaffSections,
  staffClubRail,
  staffColumnsFoundRu,
} from '../../lib/chat/staffColumnsCore.js'
import '../../styles/admin-messenger.css'

const EMPTY_RU = { [STAFF_VIEW_UNREAD]: 'Все ответили — новых нет' }

/**
 * Главный админ за монитором, как Telegram на компьютере: слева клубы, в середине люди клуба с поиском, справа диалог.
 * Состояние в адресе (?view=клуб&dm=человек) — назад/вперёд браузера и push `/messages/dm/:id` открывают то же.
 * На узком экране — по одной панели: список → диалог со стрелкой «назад».
 * @param {{ chatList: ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats> }} props
 */
export function AdminMessenger({ chatList }) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const dm = params.get('dm') ?? ''
  const view = params.get('view') || STAFF_VIEW_ALL
  const searching = Boolean(query.trim())
  const { folders, status, error, reload } = chatList

  const lastDm = useRef(dm)
  useEffect(() => {
    if (lastDm.current && lastDm.current !== dm) reload()
    lastDm.current = dm
  }, [dm, reload])

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
    <div className={`admin-msgr${dm ? ' admin-msgr--thread-open' : ''}`}>
      <aside className="admin-msgr__side">
        <div className="admin-msgr__side-head">
          <h1 className="staff-inbox__title" title="Сообщения сотрудников">
            <Mail size={22} aria-hidden />
            Сотрудники
          </h1>
          <button type="button" className="btn btn-ghost btn-icon-square" onClick={reload} disabled={status === 'loading'} title="Обновить" aria-label="Обновить">
            <RefreshCw size={18} aria-hidden className={status === 'loading' ? 'icon-spin' : undefined} />
          </button>
        </div>
        {folders ? <AdminClubRail items={rail} view={searching ? '' : current.key} onPick={pickView} /> : null}
      </aside>

      <section className="admin-msgr__list" aria-label="Сотрудники">
        <label className="chat-contacts__search admin-msgr__search">
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
          <div className="admin-msgr__status" role="status">
            {status === 'error' ? <WifiOff size={24} aria-hidden /> : <RefreshCw size={24} aria-hidden className="icon-spin" />}
            <span>{status === 'error' ? error || 'Не загрузилось — проверьте интернет' : 'Загружаем…'}</span>
          </div>
        ) : (
          <AdminStaffList
            sections={sections}
            searching={searching}
            hrefFor={(id) => hrefWith({ dm: id })}
            selectedId={dm}
            emptyText={searching ? 'Никого не нашли' : EMPTY_RU[view] || 'Пока никого нет'}
          />
        )}
      </section>

      <main className="admin-msgr__thread">
        {dm ? (
          <StaffDmPane
            key={dm}
            userId={dm}
            backTo={hrefWith({ dm: '' })}
            back={
              <Link to={hrefWith({ dm: '' })} className="btn btn-ghost btn-sm admin-msgr__back">
                <ArrowLeft size={18} aria-hidden />
                К списку
              </Link>
            }
          />
        ) : (
          <div className="admin-msgr__pick" role="status">
            <MessageCircle size={36} aria-hidden />
            <strong>Выберите, кому написать</strong>
            <span className="muted">Клуб слева, человек в списке — или найдите по имени.</span>
          </div>
        )}
      </main>
    </div>
  )
}
