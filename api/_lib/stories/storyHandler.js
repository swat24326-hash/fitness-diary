/**
 * Сторис: инструктор — лента сети; акции руководства/менеджера — только свой клуб.
 * Выкладка и бан — в своём клубе. Список — сотрудник и клиент (клиент только смотрит).
 */
import { randomUUID } from 'node:crypto'
import { loadInChunks } from '../batchCore.js'
import { sendJson } from '../adminSupabase.js'
import { checkAttachBytes, checkAttachUpload } from '../../../src/lib/chat/chatAttachCore.js'
import { checkVideoUpload } from '../../../src/lib/chat/chatVideoCore.js'
import { deleteVoice, putVoice, getVoice } from '../chat/chatVoiceStorage.js'
import { signStoryMediaToken, storyMediaSrcPath } from './storyMediaTokenCore.js'
import { avatarPhotoUrl } from '../../../src/lib/profile/avatarCore.js'
import {
  STORY_BAD_RU,
  STORY_BANNED_RU,
  STORY_BAN_TARGET_RU,
  STORY_FORBIDDEN_RU,
  STORY_GONE_RU,
  STORY_LIFETIME_DAYS,
  STORY_OTHER_CLUB_RU,
  STORY_REACT_OWN_RU,
  STORY_UNAVAILABLE_RU,
  STORY_VIDEO_BAD_RU,
  STORY_VIDEO_JSON_RU,
  STORY_VIDEO_MAX_BYTES,
  canBanClubStoryAuthor,
  canModerateClubStoryPublish,
  canPublishClubStoryNow,
  canRemoveClubStory,
  canSeeClubStoryViewers,
  canSetStoryClientOffer,
  canViewNetworkStories,
  isStoryStorageKey,
  publishClubId,
  storyAuthorNetworkVisible,
  storyCaptionOk,
  storyExpiresAt,
  storyFramesOk,
  storyIsLive,
  storyLabelRu,
  storyPhotoBytesOk,
  storyPublishMeta,
  storyReactionNext,
  storyStaffKind,
  storyStorageKey,
  storyUuid,
  storyMimeIsVideo,
  storyVideoBytesOk,
  storyVideoSecOk,
  storyViewerKey,
  storyViewerPublic,
  storyVisibleToViewer,
  viewClubId,
} from '../../../src/lib/stories/storyClubCore.js'

const fail = (res, status, error) => sendJson(res, status, { error })

function missingTable(error) {
  const code = String(error?.code ?? '')
  const msg = String(error?.message ?? '')
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function isPublishBanned(db, clubId, userId) {
  if (!storyUuid(clubId) || !storyUuid(userId)) return false
  try {
    const { data, error } = await db
      .from('club_story_publish_bans')
      .select('user_id')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      if (missingTable(error)) return false
      throw error
    }
    return Boolean(data)
  } catch (e) {
    if (missingTable(e)) return false
    throw e
  }
}

async function bannedAuthorIds(db, clubId, authorIds) {
  const ids = [...new Set(authorIds.map((id) => String(id ?? '').toLowerCase()).filter((id) => storyUuid(id)))]
  if (!ids.length) return new Set()
  try {
    const list = await loadInChunks(ids, (part) =>
      rows(db.from('club_story_publish_bans').select('user_id').eq('club_id', clubId).in('user_id', part)),
    )
    return new Set(list.map((r) => String(r.user_id).toLowerCase()))
  } catch (e) {
    if (missingTable(e)) return new Set()
    throw e
  }
}

async function viewerNames(db, viewRows) {
  const staffIds = []
  const clientIds = []
  for (const row of viewRows) {
    const key = String(row.user_key ?? '').toLowerCase()
    if (key.startsWith('u:')) staffIds.push(key.slice(2))
    if (key.startsWith('c:')) clientIds.push(key.slice(2))
  }
  const [users, clients] = await Promise.all([
    loadInChunks([...new Set(staffIds)], (part) => rows(db.from('users').select('id, name').in('id', part))),
    loadInChunks([...new Set(clientIds)], (part) => rows(db.from('clients').select('id, name').in('id', part))),
  ])
  const names = {}
  for (const user of users) names[`u:${String(user.id).toLowerCase()}`] = user.name
  for (const client of clients) names[`c:${String(client.id).toLowerCase()}`] = client.name
  return names
}

async function clubNameMap(db, clubIds) {
  const ids = [...new Set(clubIds.map((id) => String(id ?? '').toLowerCase()).filter((id) => storyUuid(id)))]
  if (!ids.length) return new Map()
  const list = await loadInChunks(ids, (part) => rows(db.from('clubs').select('id, name').in('id', part)))
  const map = new Map()
  for (const club of list) map.set(String(club.id).toLowerCase(), String(club.name ?? '').trim() || 'Клуб')
  return map
}

/** Ключи `clubId:userId` — бан выкладки в конкретном клубе. */
async function bannedAuthorKeys(db, clubIds, authorIds) {
  const clubs = [...new Set(clubIds.map((id) => String(id ?? '').toLowerCase()).filter((id) => storyUuid(id)))]
  const keys = new Set()
  for (const clubId of clubs) {
    const banned = await bannedAuthorIds(db, clubId, authorIds)
    for (const userId of banned) keys.add(`${clubId}:${userId}`)
  }
  return keys
}

async function authorMeta(db, authorIds) {
  const ids = [...new Set(authorIds.map((id) => String(id ?? '').toLowerCase()).filter((id) => storyUuid(id)))]
  if (!ids.length) return new Map()
  const users = await loadInChunks(ids, (part) =>
    rows(db.from('users').select('id, name, role, avatar_key').in('id', part)),
  )
  const map = new Map()
  for (const user of users) {
    const id = String(user.id).toLowerCase()
    map.set(id, {
      name: String(user.name ?? '').trim() || 'Сотрудник',
      kind: storyStaffKind(user.role),
      network: storyAuthorNetworkVisible(user.role),
      photo: avatarPhotoUrl(user.avatar_key, 'staff', id),
    })
  }
  return map
}

async function assertStoryReadable(db, story, { kind, ownClubId }) {
  if (!story || !liveRow(story, Date.now())) return { ok: false, status: 404, error: STORY_GONE_RU }
  const access = canViewNetworkStories({ kind, ownClubId })
  if (!access.ok) return { ok: false, status: 403, error: access.error }
  const authors = await authorMeta(db, [story.author_id])
  const meta = authors.get(String(story.author_id ?? '').toLowerCase())
  if (
    !storyVisibleToViewer({
      storyClubId: story.club_id,
      authorNetwork: Boolean(meta?.network),
      viewerOwnClubId: ownClubId,
      viewerKind: kind,
    })
  ) {
    return { ok: false, status: 403, error: STORY_OTHER_CLUB_RU }
  }
  return { ok: true }
}

function liveRow(row, now) {
  return storyIsLive({ expiresAt: row.expires_at, removedAt: row.removed_at }, now)
}

async function listNetworkStories(db, viewerKey, opts) {
  const { kind, userId, ownClubId } = opts
  const now = Date.now()
  const ownClub = String(ownClubId ?? '').trim().toLowerCase()
  const raw = (
    await rows(
      db
        .from('club_stories')
        .select('id, club_id, label, cta, expires_at, removed_at, author_id, created_at')
        .is('removed_at', null)
        .gt('expires_at', new Date(now).toISOString())
        .order('created_at', { ascending: false })
        .limit(100),
    )
  ).filter((row) => liveRow(row, now))
  if (!raw.length) return []
  const authors = await authorMeta(
    db,
    raw.map((s) => s.author_id),
  )
  const stories = raw
    .filter((s) =>
      storyVisibleToViewer({
        storyClubId: s.club_id,
        authorNetwork: Boolean(authors.get(String(s.author_id ?? '').toLowerCase())?.network),
        viewerOwnClubId: ownClub,
        viewerKind: kind,
      }),
    )
    .slice(0, 60)
  if (!stories.length) return []
  const ids = stories.map((s) => s.id)
  const frames = await rows(
    db.from('club_story_frames').select('id, story_id, pos, w, h, caption, mime').in('story_id', ids).order('pos'),
  )
  let mineRows = []
  try {
    mineRows = await rows(
      db.from('club_story_views').select('story_id, reaction').eq('user_key', viewerKey).in('story_id', ids),
    )
  } catch (e) {
    if (!missingTable(e)) throw e
    mineRows = await rows(
      db.from('club_story_views').select('story_id').eq('user_key', viewerKey).in('story_id', ids),
    )
  }
  const seen = new Set(mineRows.map((r) => r.story_id))
  const myReaction = new Map(mineRows.map((r) => [r.story_id, r.reaction ?? null]))
  const me = String(userId ?? '').toLowerCase()
  const ownIds = stories
    .filter((s) => canSeeClubStoryViewers({ authorId: s.author_id, userId }))
    .map((s) => s.id)
  let viewRows = []
  if (ownIds.length) {
    try {
      viewRows = await rows(
        db.from('club_story_views').select('story_id, user_key, seen_at, reaction').in('story_id', ownIds),
      )
    } catch (e) {
      if (!missingTable(e)) throw e
      viewRows = await rows(db.from('club_story_views').select('story_id, user_key, seen_at').in('story_id', ownIds))
    }
  }
  const names = ownIds.length ? await viewerNames(db, viewRows) : {}
  const viewersOf = new Map()
  for (const row of viewRows) {
    const list = viewersOf.get(row.story_id) ?? []
    list.push(row)
    viewersOf.set(row.story_id, list)
  }
  const byStory = new Map()
  for (const frame of frames) {
    const list = byStory.get(frame.story_id) ?? []
    list.push({
      id: frame.id,
      caption: frame.caption ?? '',
      w: frame.w,
      h: frame.h,
      mime: frame.mime ?? null,
    })
    byStory.set(frame.story_id, list)
  }
  const clubs = await clubNameMap(
    db,
    stories.map((s) => s.club_id),
  )
  const moderate = canModerateClubStoryPublish(kind)
  const banClubs =
    kind === 'admin'
      ? stories.map((s) => s.club_id)
      : kind === 'supervisor' && ownClub
        ? [ownClub]
        : []
  const banned = moderate
    ? await bannedAuthorKeys(
        db,
        banClubs,
        stories.map((s) => s.author_id),
      )
    : new Set()
  return stories.map((s) => {
    const authorId = String(s.author_id ?? '').toLowerCase()
    const clubId = String(s.club_id ?? '').toLowerCase()
    const meta = authors.get(authorId)
    const authorBanned = banned.has(`${clubId}:${authorId}`)
    const canModerateThis = kind === 'admin' || (kind === 'supervisor' && clubId === ownClub)
    const banCheck = canBanClubStoryAuthor(kind, {
      targetKind: meta?.kind ?? 'staff',
      targetUserId: authorId,
      moderatorUserId: userId,
    })
    const ownViews = canSeeClubStoryViewers({ authorId, userId })
    return {
      id: s.id,
      club_id: clubId,
      club_name: clubs.get(clubId) ?? null,
      network: Boolean(meta?.network),
      label: s.label,
      label_ru: storyLabelRu(s.label),
      cta: s.cta,
      created_at: s.created_at,
      expires_at: s.expires_at,
      seen: seen.has(s.id),
      can_remove: canRemoveClubStory(kind, { authorId: s.author_id, userId }),
      can_react: Boolean(authorId) && authorId !== me,
      my_reaction: myReaction.get(s.id) ?? null,
      author_name: meta?.name ?? 'Сотрудник',
      author_id: authorId,
      author_photo: meta?.photo ?? null,
      ...(ownViews
        ? {
            views: (viewersOf.get(s.id) ?? []).length,
            viewers: storyViewerPublic(viewersOf.get(s.id), names),
          }
        : {}),
      ...(moderate
        ? {
            author_banned: canModerateThis ? authorBanned : false,
            can_ban: canModerateThis && banCheck.ok && !authorBanned,
            can_unban: canModerateThis && banCheck.ok && authorBanned,
          }
        : {}),
      frames: byStory.get(s.id) ?? [],
    }
  })
}

async function loadStory(db, id) {
  if (!storyUuid(id)) return null
  const { data, error } = await db
    .from('club_stories')
    .select('id, club_id, author_id, expires_at, removed_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function listBannedPublishers(db, clubId) {
  try {
    const bans = await rows(db.from('club_story_publish_bans').select('user_id').eq('club_id', clubId))
    if (!bans.length) return []
    const meta = await authorMeta(
      db,
      bans.map((b) => b.user_id),
    )
    return bans.map((b) => {
      const id = String(b.user_id).toLowerCase()
      return { user_id: id, name: meta.get(id)?.name ?? 'Сотрудник' }
    })
  } catch (e) {
    if (missingTable(e)) return []
    throw e
  }
}

export async function handleStaffStoriesGet(ctx, query, res) {
  try {
    const kind = storyStaffKind(ctx.roleNorm)
    const ownClubId = ctx.profile?.club_id
    const access = canViewNetworkStories({ kind, ownClubId })
    if (!access.ok) return fail(res, 400, access.error)
    const publishCtx = publishClubId({ kind, ownClubId, requestedClubId: query?.club_id })
    const publishClub = publishCtx.ok ? publishCtx.clubId : null
    const banned = publishClub ? await isPublishBanned(ctx.supabaseAdmin, publishClub, ctx.user.id) : true
    const canPublish = Boolean(publishClub) && canPublishClubStoryNow(kind, banned)
    const moderate = canModerateClubStoryPublish(kind)
    const items = await listNetworkStories(ctx.supabaseAdmin, storyViewerKey('staff', ctx.user.id), {
      kind,
      userId: ctx.user.id,
      ownClubId,
    })
    const payload = {
      club_id: publishClub,
      own_club_id: storyUuid(ownClubId) ? String(ownClubId).toLowerCase() : null,
      can_publish: canPublish,
      can_set_offer: canSetStoryClientOffer(ctx.roleNorm),
      me: ctx.user.id,
      stories: items,
    }
    if (moderate && publishClub) {
      payload.banned_publishers = await listBannedPublishers(ctx.supabaseAdmin, publishClub)
    }
    sendJson(res, 200, payload)
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
}

export async function handleStaffStoriesPost(ctx, body, res, put = putVoice) {
  const op = String(body?.op ?? '')
  try {
    if (op === 'publish') return publishStory(ctx, body, res, put)
    if (op === 'publish-video') return publishStoryVideo(ctx, body, res, put)
    if (op === 'remove') return removeStory(ctx, body, res)
    if (op === 'ban-publish') return banPublish(ctx, body, res, true)
    if (op === 'unban-publish') return banPublish(ctx, body, res, false)
    if (op === 'react') return reactStory(ctx.supabaseAdmin, body, storyViewerKey('staff', ctx.user.id), res, {
      userId: ctx.user.id,
      ownClubId: ctx.profile?.club_id,
      kind: storyStaffKind(ctx.roleNorm),
    })
    if (op === 'seen' || op === 'frame') return staffStoryMedia(ctx, op, body, res)
    return fail(res, 400, 'Неизвестное действие')
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
}

export async function handleClientStories(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  const clubId = String(ctx.client?.club_id ?? '').trim()
  const access = canViewNetworkStories({ kind: 'staff', ownClubId: clubId })
  if (!access.ok) return fail(res, 403, access.error)
  try {
    if (action === 'story-list') {
      const stories = await listNetworkStories(db, storyViewerKey('client', ctx.clientId), {
        kind: null,
        userId: null,
        ownClubId: clubId,
      })
      sendJson(res, 200, { stories, own_club_id: String(clubId).toLowerCase() })
      return
    }
    if (action === 'story-seen') {
      return clientStoryMedia(db, 'seen', body, storyViewerKey('client', ctx.clientId), clubId, res)
    }
    if (action === 'story-frame') {
      return clientStoryMedia(db, 'frame', body, storyViewerKey('client', ctx.clientId), clubId, res)
    }
    if (action === 'story-react') {
      return reactStory(db, body, storyViewerKey('client', ctx.clientId), res, {
        userId: ctx.clientId,
        ownClubId: clubId,
        kind: 'staff',
      })
    }
    return fail(res, 400, 'Неизвестное действие')
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
}

async function staffStoryMedia(ctx, op, body, res) {
  const kind = storyStaffKind(ctx.roleNorm)
  const story = await loadStory(ctx.supabaseAdmin, body?.id)
  const gate = await assertStoryReadable(ctx.supabaseAdmin, story, { kind, ownClubId: ctx.profile?.club_id })
  if (!gate.ok) return fail(res, op === 'frame' && gate.status === 404 ? 410 : gate.status, gate.error)
  if (op === 'seen') return markSeen(ctx.supabaseAdmin, story.id, storyViewerKey('staff', ctx.user.id), res)
  return sendFrame(ctx.supabaseAdmin, body, res)
}

async function clientStoryMedia(db, op, body, viewerKey, clubId, res) {
  const story = await loadStory(db, body?.id)
  const gate = await assertStoryReadable(db, story, { kind: 'staff', ownClubId: clubId })
  if (!gate.ok) return fail(res, op === 'frame' && gate.status === 404 ? 410 : gate.status, gate.error)
  if (op === 'seen') return markSeen(db, story.id, viewerKey, res)
  return sendFrame(db, body, res)
}

async function finishPublish(ctx, clubId, prepared, put, res, meta = {}) {
  const kind = storyStaffKind(ctx.roleNorm)
  const id = randomUUID()
  const db = ctx.supabaseAdmin
  const { label, cta } = storyPublishMeta(ctx.roleNorm, meta)
  const { error } = await db.from('club_stories').insert({
    id,
    club_id: clubId,
    author_id: ctx.user.id,
    label,
    cta,
    expires_at: storyExpiresAt(Date.now(), STORY_LIFETIME_DAYS),
  })
  if (error) throw error
  const keys = []
  try {
    for (let pos = 0; pos < prepared.length; pos += 1) {
      const frame = prepared[pos]
      const key = storyStorageKey(clubId, id, pos, frame.mime)
      if (!isStoryStorageKey(key)) throw new Error('bad story key')
      await put(key, frame.bytes, frame.mime)
      keys.push(key)
      const ins = await db.from('club_story_frames').insert({
        story_id: id,
        pos,
        storage_key: key,
        mime: frame.mime,
        bytes: frame.bytes.length,
        w: frame.w,
        h: frame.h,
        caption: frame.caption,
      })
      if (ins.error) throw ins.error
    }
  } catch (e) {
    await db.from('club_stories').update({ removed_at: new Date().toISOString() }).eq('id', id)
    await Promise.all(keys.map((key) => deleteVoice(key).catch(() => {})))
    console.warn('[stories]', e?.message || e)
    return fail(res, 502, 'Не получилось выложить — попробуйте ещё раз')
  }
  const stories = await listNetworkStories(db, storyViewerKey('staff', ctx.user.id), {
    kind,
    userId: ctx.user.id,
    ownClubId: ctx.profile?.club_id,
  })
  sendJson(res, 200, {
    club_id: clubId,
    own_club_id: storyUuid(ctx.profile?.club_id) ? String(ctx.profile.club_id).toLowerCase() : null,
    can_publish: true,
    can_set_offer: canSetStoryClientOffer(ctx.roleNorm),
    me: ctx.user.id,
    stories,
  })
}

async function publishStory(ctx, body, res, put) {
  const kind = storyStaffKind(ctx.roleNorm)
  const club = publishClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: body?.club_id })
  if (!club.ok) return fail(res, kind === 'staff' ? 403 : 400, club.error)
  if (await isPublishBanned(ctx.supabaseAdmin, club.clubId, ctx.user.id)) return fail(res, 403, STORY_BANNED_RU)
  const frames = Array.isArray(body?.frames) ? body.frames : []
  if (!storyFramesOk(frames.length)) return fail(res, 400, STORY_BAD_RU)
  const prepared = []
  for (const frame of frames) {
    const caption = storyCaptionOk(frame?.caption)
    if (!caption.ok) return fail(res, 400, STORY_BAD_RU)
    if (frame?.kind === 'video') return fail(res, 400, STORY_VIDEO_JSON_RU)
    const upload = checkAttachUpload({ kind: 'photo', data: frame?.data, w: frame?.w, h: frame?.h })
    if (!upload.ok || !storyPhotoBytesOk(upload.bytes)) return fail(res, 400, STORY_BAD_RU)
    const bytes = Buffer.from(upload.data, 'base64')
    const mime = checkAttachBytes('photo', bytes)
    if (!mime) return fail(res, 400, STORY_BAD_RU)
    prepared.push({ bytes, mime, w: upload.w, h: upload.h, caption: caption.caption })
  }
  return finishPublish(ctx, club.clubId, prepared, put, res, body)
}

/** Одно видео в сторис — бинарное тело (как видеокружок в чате), до 60 с. */
async function publishStoryVideo(ctx, body, res, put) {
  const kind = storyStaffKind(ctx.roleNorm)
  const club = publishClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: body?.club_id })
  if (!club.ok) return fail(res, kind === 'staff' ? 403 : 400, club.error)
  if (await isPublishBanned(ctx.supabaseAdmin, club.clubId, ctx.user.id)) return fail(res, 403, STORY_BANNED_RU)
  const caption = storyCaptionOk(body?.caption)
  if (!caption.ok) return fail(res, 400, STORY_BAD_RU)
  const bytes = body?.video?.buffer
  const upload = checkVideoUpload({ bytes, sec: body?.video?.sec, maxBytes: STORY_VIDEO_MAX_BYTES })
  if (!upload.ok || !storyVideoSecOk(upload.sec) || !storyVideoBytesOk(upload.bytes)) {
    return fail(res, upload.ok ? 400 : upload.status || 400, STORY_VIDEO_BAD_RU)
  }
  return finishPublish(
    ctx,
    club.clubId,
    [{ bytes, mime: upload.mime, w: null, h: null, caption: caption.caption }],
    put,
    res,
    body,
  )
}

async function removeStory(ctx, body, res) {
  const kind = storyStaffKind(ctx.roleNorm)
  const db = ctx.supabaseAdmin
  const story = await loadStory(db, body?.id)
  if (!story || !liveRow(story, Date.now())) return fail(res, 404, STORY_GONE_RU)
  if (!canRemoveClubStory(kind, { authorId: story.author_id, userId: ctx.user.id })) return fail(res, 403, STORY_FORBIDDEN_RU)
  const frames = await rows(db.from('club_story_frames').select('storage_key').eq('story_id', story.id))
  const { error } = await db.from('club_stories').update({ removed_at: new Date().toISOString() }).eq('id', story.id)
  if (error) throw error
  await Promise.all(frames.map((f) => (isStoryStorageKey(f.storage_key) ? deleteVoice(f.storage_key).catch(() => {}) : null)))
  sendJson(res, 200, { ok: true })
}

async function banPublish(ctx, body, res, ban) {
  const kind = storyStaffKind(ctx.roleNorm)
  const club = viewClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: body?.club_id })
  if (!club.ok) return fail(res, kind === 'admin' ? 400 : 403, club.error)
  const targetId = String(body?.user_id ?? '').trim().toLowerCase()
  if (!storyUuid(targetId)) return fail(res, 400, STORY_BAN_TARGET_RU)
  const db = ctx.supabaseAdmin
  const { data: target, error } = await db.from('users').select('id, role, club_id').eq('id', targetId).maybeSingle()
  if (error) throw error
  if (!target) return fail(res, 404, STORY_BAN_TARGET_RU)
  const targetClub = String(target.club_id ?? '').trim().toLowerCase()
  if (targetClub && targetClub !== club.clubId.toLowerCase()) return fail(res, 403, STORY_OTHER_CLUB_RU)
  const gate = canBanClubStoryAuthor(kind, {
    targetKind: storyStaffKind(target.role),
    targetUserId: targetId,
    moderatorUserId: ctx.user.id,
  })
  if (!gate.ok) return fail(res, 403, gate.error)
  if (ban) {
    const { error: ups } = await db.from('club_story_publish_bans').upsert(
      { club_id: club.clubId, user_id: targetId, banned_by: ctx.user.id, banned_at: new Date().toISOString() },
      { onConflict: 'club_id,user_id' },
    )
    if (ups) throw ups
    const live = await rows(
      db
        .from('club_stories')
        .select('id')
        .eq('club_id', club.clubId)
        .eq('author_id', targetId)
        .is('removed_at', null)
        .gt('expires_at', new Date().toISOString()),
    )
    if (live.length) {
      const nowIso = new Date().toISOString()
      await db
        .from('club_stories')
        .update({ removed_at: nowIso })
        .in(
          'id',
          live.map((s) => s.id),
        )
      const frames = await rows(
        db
          .from('club_story_frames')
          .select('storage_key')
          .in(
            'story_id',
            live.map((s) => s.id),
          ),
      )
      await Promise.all(frames.map((f) => (isStoryStorageKey(f.storage_key) ? deleteVoice(f.storage_key).catch(() => {}) : null)))
    }
  } else {
    const { error: del } = await db
      .from('club_story_publish_bans')
      .delete()
      .eq('club_id', club.clubId)
      .eq('user_id', targetId)
    if (del) throw del
  }
  sendJson(res, 200, { ok: true, banned: ban })
}

async function markSeen(db, id, viewerKey, res) {
  const { error } = await db.from('club_story_views').upsert(
    { story_id: id, user_key: viewerKey, seen_at: new Date().toISOString() },
    { onConflict: 'story_id,user_key' },
  )
  if (error) throw error
  sendJson(res, 200, { ok: true })
}

async function reactStory(db, body, viewerKey, res, { userId, ownClubId, kind }) {
  const story = await loadStory(db, body?.id)
  const gate = await assertStoryReadable(db, story, { kind, ownClubId })
  if (!gate.ok) return fail(res, gate.status, gate.error)
  if (String(story.author_id ?? '').toLowerCase() === String(userId ?? '').toLowerCase()) {
    return fail(res, 400, STORY_REACT_OWN_RU)
  }
  let current = null
  try {
    const { data, error } = await db
      .from('club_story_views')
      .select('reaction')
      .eq('story_id', story.id)
      .eq('user_key', viewerKey)
      .maybeSingle()
    if (error) throw error
    current = data?.reaction ?? null
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
  const next = storyReactionNext(current, body?.emoji)
  if (!next.ok) return fail(res, 400, next.error)
  const { error } = await db.from('club_story_views').upsert(
    {
      story_id: story.id,
      user_key: viewerKey,
      seen_at: new Date().toISOString(),
      reaction: next.emoji,
    },
    { onConflict: 'story_id,user_key' },
  )
  if (error) {
    if (missingTable(error)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw error
  }
  sendJson(res, 200, { ok: true, reaction: next.emoji })
}

async function sendFrame(db, body, res) {
  if (!storyUuid(body?.id) || !storyUuid(body?.frame_id)) return fail(res, 400, STORY_BAD_RU)
  const story = await loadStory(db, body.id)
  if (!story || !liveRow(story, Date.now())) return fail(res, 410, STORY_GONE_RU)
  const { data, error } = await db
    .from('club_story_frames')
    .select('storage_key, mime')
    .eq('id', body.frame_id)
    .eq('story_id', story.id)
    .maybeSingle()
  if (error) throw error
  if (!data || !isStoryStorageKey(data.storage_key)) return fail(res, 410, STORY_GONE_RU)
  // Видео: только JWT-URL (байты качает <video> с Range). Не тянем файл на API заранее.
  if (storyMimeIsVideo(data.mime)) {
    const secret = String(process.env.JWT_SECRET || '').trim()
    const token = secret
      ? signStoryMediaToken({ key: data.storage_key, mime: data.mime }, secret)
      : null
    if (token) {
      sendJson(res, 200, {
        stream: true,
        src: storyMediaSrcPath(token),
        mime: String(data.mime).split(';')[0].trim(),
      })
      return
    }
    let bytes
    try {
      bytes = await getVoice(data.storage_key)
    } catch (e) {
      console.warn('[stories]', e?.message || e)
      return fail(res, 502, 'Не получилось загрузить')
    }
    if (!bytes) return fail(res, 410, STORY_GONE_RU)
    res.statusCode = 200
    res.setHeader('Content-Type', String(data.mime))
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'private, no-store')
    res.end(bytes)
    return
  }
  let bytes
  try {
    bytes = await getVoice(data.storage_key)
  } catch (e) {
    console.warn('[stories]', e?.message || e)
    return fail(res, 502, 'Не получилось загрузить')
  }
  if (!bytes) return fail(res, 410, STORY_GONE_RU)
  sendJson(res, 200, { data: bytes.toString('base64'), mime: data.mime })
}
