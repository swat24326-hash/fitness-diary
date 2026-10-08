import { useCallback } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { ClipboardList, Mail, Megaphone } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminInboxComposer } from './AdminInboxComposer.jsx'
import { AdminInboxList } from './AdminInboxList.jsx'
import { AdminInboxResults } from './AdminInboxResults.jsx'
import { useAdminInboxList } from './useAdminInbox.js'

/**
 * /admin/inbox и /club/inbox — рассылки во «Входящие» клиентов и команды: список → создать (?new=survey|notice) → итоги (?id=).
 * @param {{ accessMode?: 'admin'|'supervisor' }} props
 */
export function AdminInboxPage({ accessMode = 'admin' }) {
  const [search, setSearch] = useSearchParams()
  const outlet = useOutletContext()
  const list = useAdminInboxList()
  const newKind = search.get('new')
  const openId = search.get('id')

  const go = useCallback(
    (patch) => {
      setSearch((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        next.delete('id')
        for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v)
        return next
      })
    },
    [setSearch],
  )

  let body
  if (newKind === 'survey' || newKind === 'notice') {
    body = (
      <AdminInboxComposer
        key={newKind}
        kind={newKind}
        clubs={list.clubs}
        defaultClubId={String(outlet?.clubId ?? '').trim()}
        isSupervisor={accessMode === 'supervisor'}
        pushBlocker={list.pushBlocker}
        onCancel={() => go({})}
        onSent={(id) => {
          list.reload()
          go({ id })
        }}
      />
    )
  } else if (openId) {
    body = <AdminInboxResults id={openId} onBack={() => go({})} onChanged={list.reload} />
  } else {
    body = <AdminInboxList list={list} onOpen={(id) => go({ id })} />
  }

  return (
    <div className="admin-page admin-inbox">
      <AdminSectionHeader
        icon={Mail}
        title="Опросы и объявления"
        lead="Объявления и опросы во «Входящие» — клиентам в приложение или команде клуба в шапку."
      >
        {newKind || openId ? null : (
          <>
            <button type="button" className="btn btn-primary btn-touch admin-inbox__new" onClick={() => go({ new: 'survey' })}>
              <ClipboardList size={18} aria-hidden />
              Опрос
            </button>
            <button type="button" className="btn btn-secondary btn-touch admin-inbox__new" onClick={() => go({ new: 'notice' })}>
              <Megaphone size={18} aria-hidden />
              Объявление
            </button>
          </>
        )}
      </AdminSectionHeader>
      {body}
    </div>
  )
}
