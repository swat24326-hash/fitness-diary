import { useCallback, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { TrainerClientsBrowseFilters } from '../../components/trainer/TrainerClientsBrowseFilters.jsx'
import { BirthdayBrowseSectionHeader } from '../../components/clients/BirthdayBrowseSectionHeader.jsx'
import { CLIENT_LIST_PAGE_SIZE } from '../../lib/clientListPagination.js'
import { buildCoachClientsView } from '../../lib/coach/coachClientsListCore.js'
import { CoachClientRow } from './CoachClientRow.jsx'
import { CoachClientSheet } from './CoachClientSheet.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState, CoachStatus } from './CoachStatus.jsx'
import { useCoachClientsData } from './useCoachClientsData.js'

/** «Клиенты» на телефоне: фильтры и абонементы своих клиентов — только просмотр, без тренировок и карточки. */
export function CoachClientsPage() {
  const data = useCoachClientsData()
  const { clients, memByClient, today } = data
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(CLIENT_LIST_PAGE_SIZE)
  const [openId, setOpenId] = useState('')
  const view = useMemo(
    () => buildCoachClientsView({ clients, memByClient, today, filter, query }),
    [clients, memByClient, today, filter, query],
  )
  const applyFilter = (id) => {
    setLimit(CLIENT_LIST_PAGE_SIZE)
    setFilter((cur) => (id === 'all' || cur === id ? 'all' : id))
  }
  const closeSheet = useCallback(() => setOpenId(''), [])
  const open = clients.find((c) => c.id === openId) ?? null
  const shown = view.items.slice(0, limit)

  return (
    <CoachShell>
      <div className="coach-clients">
        <label className="coach-clients__search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setLimit(CLIENT_LIST_PAGE_SIZE)
              setQuery(e.target.value)
            }}
            placeholder="Имя, телефон или карта"
            aria-label="Поиск клиента"
          />
        </label>
        <TrainerClientsBrowseFilters counts={view.counts} quickFilter={filter} onApply={applyFilter} />
        {data.status !== 'ready' && !data.data ? (
          <CoachLoadState status={data.status} error={data.error} onRetry={() => void data.reload()} />
        ) : view.total === 0 ? (
          <CoachStatus icon={Users} title="Никого" hint={query ? 'По поиску никого не нашли.' : 'В этом фильтре клиентов нет.'} />
        ) : (
          <>
            <ul className="coach-clients__list" aria-label="Клиенты">
              {shown.map((item) =>
                item.type === 'section' ? (
                  <BirthdayBrowseSectionHeader key={`s-${item.key}`} title={item.title} count={item.count} />
                ) : (
                  <CoachClientRow
                    key={item.client.id}
                    client={item.client}
                    memList={memByClient[item.client.id] ?? []}
                    today={today}
                    filter={filter}
                    onOpen={() => setOpenId(item.client.id)}
                  />
                ),
              )}
            </ul>
            {view.items.length > limit ? (
              <button type="button" className="btn btn-secondary btn-touch" onClick={() => setLimit((n) => n + CLIENT_LIST_PAGE_SIZE)}>
                Показать ещё
              </button>
            ) : null}
          </>
        )}
      </div>
      <CoachClientSheet client={open} memList={open ? memByClient[open.id] ?? [] : []} today={today} onClose={closeSheet} />
    </CoachShell>
  )
}
