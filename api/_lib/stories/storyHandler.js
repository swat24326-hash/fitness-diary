/**
 * Реклама клуба в сторис. Свои сторис людей нет.
 * Список и выкладка — сотрудник (admin-data / телефон тренера) и клиент своего клуба (только смотреть).
 */
import { randomUUID } from 'node:crypto'
import { loadInChunks } from '../batchCore.js'
import { sendJson } from '../adminSupabase.js'
import { checkAttachBytes, checkAttachUpload } from '../../../src/lib/chat/chatAttachCore.js'
import { deleteVoice, putVoice, getVoice } from '../chat/chatVoiceStorage.js'
import {
  STORY_BAD_RU,
  STORY_FORBIDDEN_RU,
  STORY_GONE_RU,
  STORY_OTHER_CLUB_RU,
  STORY_UNAVAILABLE_RU,
  canPublishClubStory,
  canRemoveClubStory,
  isStoryStorageKey,
  publishClubId,
  storyCaptionOk,
  storyCtaOk,
  storyDaysOk,
  storyFramesOk,
  storyIsLive,
  storyLabelRu,
  storyPhotoBytesOk,
  storyStaffKind,
  storyStorageKey,
  storyUuid,
  storyViewerKey,
  storyViewerPublic,
  viewClubId,
  storyExpiresAt,
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

async function viewerNames(db, clubId, viewRows) {
  const staffIds = []
  const clientIds = []
  for (const row of viewRows) {
    const key = String(row.user_key ?? '').toLowerCase()
    if (key.startsWith('u:')) staffIds.push(key.slice(2))
    if (key.startsWith('c:')) clientIds.push(key.slice(2))
  }
  const [users, clients] = await Promise.all([
    loadInChunks([...new Set(staffIds)], (part) => rows(db.from('users').select('id, name').in('id', part))),
    loadInChunks([...new Set(clientIds)], (part) =>
      rows(db.from('clients').select('id, name').eq('club_id', clubId).in('id', part)),
    ),
  ])
  const names = {}
  for (const user of users) names[`u:${String(user.id).toLowerCase()}`] = user.name
  for (const client of clients) names[`c:${String(client.id).toLowerCase()}`] = client.name
  return names
}

function liveRow(row, now) {
  return storyIsLive({ expiresAt: row.expires_at, removedAt: row.removed_at }, now)
}

async function listClubStories(db, clubId, viewerKey, withViews) {
  const now = Date.now()
  const stories = (await rows(
    db
      .from('club_stories')
      .select('id, label, cta, expires_at, removed_at, author_id, created_at')
      .eq('club_id', clubId)
      .is('removed_at', null)
      .gt('expires_at', new Date(now).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  )).filter((row) => liveRow(row, now))
  if (!stories.length) return []
  const ids = stories.map((s) => s.id)
  const frames = await rows(
    db.from('club_story_frames').select('id, story_id, pos, w, h, caption').in('story_id', ids).order('pos'),
  )
  const seenRows = await rows(
    db.from('club_story_views').select('story_id').eq('user_key', viewerKey).in('story_id', ids),
  )
  const seen = new Set(seenRows.map((r) => r.story_id))
  const viewRows = withViews
    ? await rows(db.from('club_story_views').select('story_id, user_key, seen_at').in('story_id', ids))
    : []
  const names = withViews ? await viewerNames(db, clubId, viewRows) : {}
  const viewersOf = new Map()
  for (const row of viewRows) {
    const list = viewersOf.get(row.story_id) ?? []
    list.push(row)
    viewersOf.set(row.story_id, list)
  }
  const byStory = new Map()
  for (const frame of frames) {
    const list = byStory.get(frame.story_id) ?? []
    list.push({ id: frame.id, caption: frame.caption ?? '', w: frame.w, h: frame.h })
    byStory.set(frame.story_id, list)
  }
  return stories.map((s) => ({
    id: s.id,
    label: s.label,
    label_ru: storyLabelRu(s.label),
    cta: s.cta,
    expires_at: s.expires_at,
    seen: seen.has(s.id),
    ...(withViews
      ? { views: (viewersOf.get(s.id) ?? []).length, viewers: storyViewerPublic(viewersOf.get(s.id), names) }
      : {}),
    frames: byStory.get(s.id) ?? [],
  }))
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

export async function handleStaffStoriesGet(ctx, query, res) {
  try {
    const kind = storyStaffKind(ctx.roleNorm)
    const club = viewClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: query?.club_id })
    if (!club.ok) return fail(res, 400, club.error)
    const items = await listClubStories(ctx.supabaseAdmin, club.clubId, storyViewerKey('staff', ctx.user.id), canPublishClubStory(kind))
    sendJson(res, 200, { club_id: club.clubId, can_publish: canPublishClubStory(kind), stories: items })
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
}

export async function handleStaffStoriesPost(ctx, body, res, put = putVoice) {
  const op = String(body?.op ?? '')
  try {
    if (op === 'publish') return publishStory(ctx, body, res, put)
    if (op === 'remove') return removeStory(ctx, body, res)
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
  if (!storyUuid(clubId)) return fail(res, 403, STORY_OTHER_CLUB_RU)
  try {
    if (action === 'story-list') {
      const stories = await listClubStories(db, clubId, storyViewerKey('client', ctx.clientId), false)
      sendJson(res, 200, { stories })
      return
    }
    if (action === 'story-seen') return markSeen(db, body?.id, storyViewerKey('client', ctx.clientId), res, clubId)
    if (action === 'story-frame') return sendFrame(db, body, res, clubId)
    return fail(res, 400, 'Неизвестное действие')
  } catch (e) {
    if (missingTable(e)) return fail(res, 503, STORY_UNAVAILABLE_RU)
    throw e
  }
}

async function staffStoryMedia(ctx, op, body, res) {
  const story = await loadStory(ctx.supabaseAdmin, body?.id)
  if (!story || !liveRow(story, Date.now())) return fail(res, op === 'frame' ? 410 : 404, STORY_GONE_RU)
  const club = viewClubId({
    kind: storyStaffKind(ctx.roleNorm),
    ownClubId: ctx.profile?.club_id,
    requestedClubId: story.club_id,
  })
  if (!club.ok) return fail(res, 403, club.error)
  if (op === 'seen') return markSeen(ctx.supabaseAdmin, story.id, storyViewerKey('staff', ctx.user.id), res, story.club_id)
  return sendFrame(ctx.supabaseAdmin, body, res, story.club_id)
}

async function publishStory(ctx, body, res, put) {
  const kind = storyStaffKind(ctx.roleNorm)
  const club = publishClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: body?.club_id })
  if (!club.ok) return fail(res, kind === 'staff' ? 403 : 400, club.error)
  const label = STORY_LABELS_OK(body?.label)
  const cta = storyCtaOk(body?.cta ?? 'none')
  const frames = Array.isArray(body?.frames) ? body.frames : []
  if (!label || !cta || !storyDaysOk(body?.days) || !storyFramesOk(frames.length)) return fail(res, 400, STORY_BAD_RU)
  const prepared = []
  for (const frame of frames) {
    const caption = storyCaptionOk(frame?.caption)
    const upload = checkAttachUpload({ kind: 'photo', data: frame?.data, w: frame?.w, h: frame?.h })
    if (!caption.ok || !upload.ok || !storyPhotoBytesOk(upload.bytes)) return fail(res, 400, STORY_BAD_RU)
    const bytes = Buffer.from(upload.data, 'base64')
    const mime = checkAttachBytes('photo', bytes)
    if (!mime) return fail(res, 400, STORY_BAD_RU)
    prepared.push({ bytes, mime, w: upload.w, h: upload.h, caption: caption.caption })
  }
  const id = randomUUID()
  const db = ctx.supabaseAdmin
  const { error } = await db.from('club_stories').insert({
    id,
    club_id: club.clubId,
    author_id: ctx.user.id,
    label,
    cta,
    expires_at: storyExpiresAt(Date.now(), Number(body.days)),
  })
  if (error) throw error
  const keys = []
  try {
    for (let pos = 0; pos < prepared.length; pos += 1) {
      const frame = prepared[pos]
      const key = storyStorageKey(club.clubId, id, pos, frame.mime)
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
  const stories = await listClubStories(db, club.clubId, storyViewerKey('staff', ctx.user.id), true)
  sendJson(res, 200, { club_id: club.clubId, can_publish: true, stories })
}

function STORY_LABELS_OK(label) {
  return label === 'news' || label === 'promo' ? label : null
}

async function removeStory(ctx, body, res) {
  const kind = storyStaffKind(ctx.roleNorm)
  const db = ctx.supabaseAdmin
  const story = await loadStory(db, body?.id)
  if (!story || !liveRow(story, Date.now())) return fail(res, 404, STORY_GONE_RU)
  const club = viewClubId({ kind, ownClubId: ctx.profile?.club_id, requestedClubId: story.club_id })
  if (!club.ok || club.clubId !== story.club_id) return fail(res, 403, STORY_OTHER_CLUB_RU)
  if (!canRemoveClubStory(kind, { authorId: story.author_id, userId: ctx.user.id })) return fail(res, 403, STORY_FORBIDDEN_RU)
  const frames = await rows(db.from('club_story_frames').select('storage_key').eq('story_id', story.id))
  const { error } = await db.from('club_stories').update({ removed_at: new Date().toISOString() }).eq('id', story.id)
  if (error) throw error
  await Promise.all(frames.map((f) => (isStoryStorageKey(f.storage_key) ? deleteVoice(f.storage_key).catch(() => {}) : null)))
  sendJson(res, 200, { ok: true })
}

async function markSeen(db, id, viewerKey, res, clubId) {
  const story = await loadStory(db, id)
  if (!story || !liveRow(story, Date.now())) return fail(res, 404, STORY_GONE_RU)
  if (clubId && story.club_id !== clubId) return fail(res, 403, STORY_OTHER_CLUB_RU)
  const { error } = await db.from('club_story_views').upsert(
    { story_id: story.id, user_key: viewerKey, seen_at: new Date().toISOString() },
    { onConflict: 'story_id,user_key' },
  )
  if (error) throw error
  sendJson(res, 200, { ok: true })
}

async function sendFrame(db, body, res, clubId) {
  if (!storyUuid(body?.id) || !storyUuid(body?.frame_id)) return fail(res, 400, STORY_BAD_RU)
  const story = await loadStory(db, body.id)
  if (!story || !liveRow(story, Date.now())) return fail(res, 410, STORY_GONE_RU)
  if (clubId && story.club_id !== clubId) return fail(res, 403, STORY_OTHER_CLUB_RU)
  const { data, error } = await db
    .from('club_story_frames')
    .select('storage_key, mime')
    .eq('id', body.frame_id)
    .eq('story_id', story.id)
    .maybeSingle()
  if (error) throw error
  if (!data || !isStoryStorageKey(data.storage_key)) return fail(res, 410, STORY_GONE_RU)
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
