import { useCallback } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { ClipboardList, Mail, Megaphone, Star } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminInboxComposer } from './AdminInboxComposer.jsx'
import { AdminInboxList } from './AdminInboxList.jsx'
import { AdminInboxResults } from './AdminInboxResults.jsx'
import { AdminInboxRatingsList } from './AdminInboxRatingsList.jsx'
import { AdminInboxRatingDetail } from './AdminInboxRatingDetail.jsx'
import { useAdminInboxList } from './useAdminInbox.js'

/**
 * /admin/inbox и /club/inbox — вкладки «Рассылки» | «Оценки».
 * Рассылки: список → создать (?new=survey|notice) → итоги (?id=).
 * Оценки: список (?tab=ratings) → деталь (?tab=ratings&rid=).
 * @param {{ accessMode?: 'admin'|'supervisor' }} props
 */
export function AdminInboxPage({ accessMode = 'admin' }) {
  const [search, setSearch] = useSearchParams()
  const outlet = useOutletContext()
  const list = useAdminInboxList()
  const tab = search.get('tab') === 'ratings' ? 'ratings' : 'campaigns'
  const newKind = search.get('new')
  const openId = search.get('id')
  const ratingId = search.get('rid')
  const onRatings = tab === 'ratings'
  const composing = !onRatings && (newKind === 'survey' || newKind === 'notice')
  const viewingCampaign = !onRatings && Boolean(openId)
  const hideNewButtons = composing || viewingCampaign || onRatings

  const go = useCallback(
    (patch, { keepTab } = {}) => {
      setSearch((prev) => {
        const next = new URLSearchParams()
        const stayRatings = keepTab ? prev.get('tab') === 'ratings' : patch.tab === 'ratings'
        if (stayRatings || patch.tab === 'ratings') next.set('tab', 'ratings')
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'tab') continue
          if (v) next.set(k, v)
        }
        return next
      })
    },
    [setSearch],
  )

  let body
  if (onRatings) {
    body = ratingId ? (
      <AdminInboxRatingDetail id={ratingId} onBack={() => go({ tab: 'ratings' })} />
    ) : (
      <AdminInboxRatingsList onOpen={(id) => go({ tab: 'ratings', rid: id })} />
    )
  } else if (composing) {
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
  } else if (viewingCampaign) {
    body = <AdminInboxResults id={openId} onBack={() => go({})} onChanged={list.reload} />
  } else {
    body = <AdminInboxList list={list} onOpen={(id) => go({ id })} />
  }

  return (
    <div className="admin-page admin-inbox">
      <AdminSectionHeader
        icon={Mail}
        title="Опросы и объявления"
        lead="Рассылки во «Входящие» и оценки абонемента от клиентов."
      >
        {hideNewButtons ? null : (
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

      {composing || viewingCampaign ? null : (
        <div className="admin-inbox__tabs" role="tablist" aria-label="Разделы">
          <button
            type="button"
            role="tab"
            id="admin-inbox-tab-campaigns"
            aria-selected={!onRatings}
            className={`admin-inbox__tab${!onRatings ? ' admin-inbox__tab--on' : ''}`}
            onClick={() => go({})}
          >
            Рассылки
          </button>
          <button
            type="button"
            role="tab"
            id="admin-inbox-tab-ratings"
            aria-selected={onRatings}
            className={`admin-inbox__tab${onRatings ? ' admin-inbox__tab--on' : ''}`}
            onClick={() => go({ tab: 'ratings' })}
          >
            <Star size={16} aria-hidden />
            Оценки
          </button>
        </div>
      )}

      {body}
    </div>
  )
}
