import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import {
  banCoachStoryPublish,
  banStaffStoryPublish,
  fetchClientStories,
  fetchClientStoryFrame,
  fetchCoachStories,
  fetchCoachStoryFrame,
  fetchStaffStories,
  fetchStaffStoryFrame,
  publishCoachStory,
  publishStaffStory,
  reactClientStory,
  reactCoachStory,
  reactStaffStory,
  removeCoachStory,
  removeStaffStory,
  seenClientStory,
  seenCoachStory,
  seenStaffStory,
  unbanCoachStoryPublish,
  unbanStaffStoryPublish,
} from '../../lib/stories/storyApi.js'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { groupClubStoryAuthors, STORY_OFFLINE_RU } from '../../lib/stories/storyClubCore.js'
import { AvatarPhoto } from '../profile/AvatarPhoto.jsx'
import { StoryCompose } from './StoryCompose.jsx'
import { StoryRing } from './StoryRing.jsx'
import { StoryViewer } from './StoryViewer.jsx'

const API = {
  staff: {
    list: fetchStaffStories,
    frame: fetchStaffStoryFrame,
    seen: seenStaffStory,
    react: reactStaffStory,
    publish: publishStaffStory,
    remove: removeStaffStory,
    ban: banStaffStoryPublish,
    unban: unbanStaffStoryPublish,
  },
  coach: {
    list: () => fetchCoachStories(),
    frame: fetchCoachStoryFrame,
    seen: seenCoachStory,
    react: reactCoachStory,
    publish: publishCoachStory,
    remove: removeCoachStory,
    ban: (userId) => banCoachStoryPublish(userId),
    unban: (userId) => unbanCoachStoryPublish(userId),
  },
  client: {
    list: () => fetchClientStories(),
    frame: fetchClientStoryFrame,
    seen: seenClientStory,
    react: reactClientStory,
    publish: null,
    remove: null,
    ban: null,
    unban: null,
  },
}

/**
 * Ряд кружков сторис клуба: один автор — один кружок (как в Telegram).
 * channel: staff | coach | client.
 */
export function ClubStoryRail({ channel = 'staff', clubId = null }) {
  const navigate = useNavigate()
  const api = API[channel]
  const [pack, setPack] = useState(null)
  const [error, setError] = useState('')
  const [openAuthorId, setOpenAuthorId] = useState(null)
  const [compose, setCompose] = useState(false)
  const [busy, setBusy] = useState(false)
  const canPublish = channel !== 'client' && Boolean(pack?.can_publish)

  const load = useCallback(() => {
    const run = channel === 'staff' ? api.list(clubId) : api.list()
    run
      .then((data) => {
        setPack(data)
        setError('')
      })
      .catch((e) => {
        const msg = e?.message || STORY_OFFLINE_RU
        if (msg.includes('недоступ')) return
        setError(msg)
      })
  }, [api, channel, clubId])

  useEffect(() => {
    load()
  }, [load])

  const stories = pack?.stories ?? []
  const groups = useMemo(
    () => groupClubStoryAuthors(stories, { myUserId: pack?.me }),
    [stories, pack?.me],
  )
  const openGroup = groups.find((g) => g.author_id === openAuthorId) ?? null
  const openAuthorIndex = groups.findIndex((g) => g.author_id === openAuthorId)
  const bannedPublishers = Array.isArray(pack?.banned_publishers) ? pack.banned_publishers : []
  if (!groups.length && !canPublish && !bannedPublishers.length && !error) return null

  const stepPeer = (delta) => {
    if (openAuthorIndex < 0) return false
    const next = groups[openAuthorIndex + delta]
    if (!next) return false
    setOpenAuthorId(next.author_id)
    return true
  }

  const onSeen = (id) => {
    setPack((prev) =>
      prev ? { ...prev, stories: prev.stories.map((s) => (s.id === id ? { ...s, seen: true } : s)) } : prev,
    )
    api.seen(id).catch(() => {})
  }

  return (
    <div className="stories-rail">
      <div className="stories-rail__row">
        {canPublish ? (
          <button
            type="button"
            className="stories-rail__add btn-touch"
            onClick={() => setCompose(true)}
            aria-label="Выложить сторис"
            title="Выложить сторис"
          >
            <Plus size={20} aria-hidden />
          </button>
        ) : null}
        {groups.map((group) => {
          const title = group.mine ? 'Вы' : group.author_name
          const views = group.views
          const initials = chatInitials(group.author_name) || '?'
          return (
            <button
              key={group.author_id}
              type="button"
              className={`stories-rail__person${group.mine ? ' is-mine' : ''}`}
              onClick={() => setOpenAuthorId(group.author_id)}
              aria-label={group.unseen ? `${title}, есть новое` : title}
              title={group.mine && views != null ? `${title}, ${views} просмотров` : title}
            >
              <span className="stories-rail__circle">
                <StoryRing stories={group.stories} />
                <span className="stories-rail__face">
                  <AvatarPhoto
                    src={group.author_photo}
                    fallback={<span className="stories-rail__initials">{initials}</span>}
                  />
                </span>
              </span>
              <span className="stories-rail__name">{title}</span>
              {group.mine && views != null ? <small className="stories-rail__views">{views}</small> : null}
            </button>
          )
        })}
      </div>
      {error && !groups.length ? <p className="stories-rail__error">{error}</p> : null}
      {bannedPublishers.length && api.unban ? (
        <ul className="stories-rail__banned">
          {bannedPublishers.map((person) => (
            <li key={person.user_id}>
              <span>{person.name} · нельзя выкладывать</span>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => {
                  if (!window.confirm(`Снова разрешить ${person.name} выкладывать сторис?`)) return
                  api
                    .unban(person.user_id, clubId || pack?.club_id)
                    .then(() => load())
                    .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
                }}
              >
                Разрешить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {openGroup ? (
        <StoryViewer
          key={openGroup.author_id}
          stories={openGroup.stories}
          loadFrame={api.frame}
          onSeen={onSeen}
          onPeer={stepPeer}
          onClose={() => {
            setOpenAuthorId(null)
            if (canPublish || openGroup.mine) load()
          }}
          onCta={
            channel === 'client'
              ? (cta) => {
                  setOpenAuthorId(null)
                  navigate(cta === 'chat' ? '/me/chat/sales' : CLIENT_HOME)
                }
              : undefined
          }
          onRemove={
            api.remove
              ? (id) => {
                  if (!window.confirm('Снять эту сторис?')) return
                  api
                    .remove(id)
                    .then(() => {
                      setOpenAuthorId(null)
                      load()
                    })
                    .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
                }
              : undefined
          }
          onBanPublish={
            api.ban
              ? (authorId) => {
                  if (!window.confirm('Запретить этому сотруднику выкладывать сторис? Живые кадры снимутся.')) {
                    return
                  }
                  api
                    .ban(authorId, clubId || pack?.club_id)
                    .then(() => {
                      setOpenAuthorId(null)
                      load()
                    })
                    .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
                }
              : undefined
          }
          onUnbanPublish={
            api.unban
              ? (authorId) => {
                  if (!window.confirm('Снова разрешить этому сотруднику выкладывать сторис?')) return
                  api
                    .unban(authorId, clubId || pack?.club_id)
                    .then(() => load())
                    .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
                }
              : undefined
          }
          onReact={api.react ? (id, emoji) => api.react(id, emoji) : undefined}
        />
      ) : null}
      {compose ? (
        <StoryCompose
          busy={busy}
          error={error}
          showOfferControls={Boolean(pack?.can_set_offer)}
          onClose={() => setCompose(false)}
          onSubmit={(body) => {
            setBusy(true)
            api
              .publish({ ...body, club_id: clubId || pack?.club_id })
              .then((data) => {
                setPack(data)
                setCompose(false)
                setError('')
              })
              .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
              .finally(() => setBusy(false))
          }}
        />
      ) : null}
    </div>
  )
}
