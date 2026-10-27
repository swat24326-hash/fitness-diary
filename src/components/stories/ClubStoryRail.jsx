import { useCallback, useEffect, useState } from 'react'
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
import { STORY_OFFLINE_RU } from '../../lib/stories/storyClubCore.js'
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
 * Кружок рекламы своего клуба. channel: staff (планшет и админ), coach (телефон тренера), client.
 * @param {{ channel?: 'staff' | 'coach' | 'client', clubId?: string | null }} props
 */
export function ClubStoryRail({ channel = 'staff', clubId = null }) {
  const navigate = useNavigate()
  const api = API[channel]
  const [pack, setPack] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
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
  const bannedPublishers = Array.isArray(pack?.banned_publishers) ? pack.banned_publishers : []
  const unseen = stories.some((s) => !s.seen)
  const views = stories.reduce((sum, s) => sum + (s.views ?? 0), 0)
  if (!stories.length && !canPublish && !bannedPublishers.length && !error) return null

  const onSeen = (id) => {
    setPack((prev) =>
      prev ? { ...prev, stories: prev.stories.map((s) => (s.id === id ? { ...s, seen: true } : s)) } : prev,
    )
    api.seen(id).catch(() => {})
  }

  return (
    <div className="stories-rail">
      {stories.length ? (
        <button
          type="button"
          className="stories-rail__circle"
          onClick={() => setOpen(true)}
          aria-label={unseen ? `${stories[0].label_ru}, есть новое` : stories[0].label_ru}
          title={canPublish ? `${stories[0].label_ru}, ${views} просмотров` : stories[0].label_ru}
        >
          <StoryRing stories={stories} />
          <span className="stories-rail__face">
            <span>{stories[0].label_ru}</span>
            {canPublish ? <small>{views}</small> : null}
          </span>
        </button>
      ) : null}
      {canPublish ? (
        <button type="button" className="stories-rail__add btn-touch" onClick={() => setCompose(true)} aria-label="Выложить сторис" title="Выложить сторис">
          <Plus size={20} aria-hidden />
        </button>
      ) : null}
      {error && !stories.length ? <p className="stories-rail__error">{error}</p> : null}
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
      {open ? (
        <StoryViewer
          stories={stories}
          loadFrame={api.frame}
          onSeen={onSeen}
          onClose={() => {
            setOpen(false)
            if (canPublish) load()
          }}
          onCta={
            channel === 'client'
              ? (cta) => {
                  setOpen(false)
                  navigate(cta === 'chat' ? '/me/chat/sales' : CLIENT_HOME)
                }
              : undefined
          }
          onRemove={
            api.remove
              ? (id) => {
                  if (!window.confirm('Снять эту рекламу?')) return
                  api
                    .remove(id)
                    .then(() => {
                      setOpen(false)
                      load()
                    })
                    .catch((e) => setError(e?.message || STORY_OFFLINE_RU))
                }
              : undefined
          }
          onBanPublish={
            api.ban
              ? (authorId) => {
                  if (!window.confirm('Запретить этому сотруднику выкладывать сторис клуба? Живые кадры снимутся.')) {
                    return
                  }
                  api
                    .ban(authorId, clubId || pack?.club_id)
                    .then(() => {
                      setOpen(false)
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
