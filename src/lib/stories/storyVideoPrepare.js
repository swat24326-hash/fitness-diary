/** Видео для кадра сторис: длительность и вес; уходит бинарным POST, не base64. */
import {
  STORY_VIDEO_BAD_RU,
  STORY_VIDEO_HEAVY_RU,
  STORY_VIDEO_LONG_RU,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_SEC,
  STORY_VIDEO_MIN_SEC,
} from './storyClubCore.js'
import { baseVideoMime } from '../chat/chatVideoCore.js'
import { storyVideoApplyFaststart } from './storyMp4FaststartCore.js'

function probeSec(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const sec = Math.round(Number(video.duration) || 0)
      URL.revokeObjectURL(url)
      resolve(sec)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(STORY_VIDEO_BAD_RU))
    }
    video.src = url
  })
}

/**
 * @param {Blob|File} file
 * @param {{ sec?: number }} [opts] известная длительность записи с камеры
 * @returns {Promise<{ kind: 'video', blob: Blob, mime: string, sec: number, bytes: number, previewUrl: string }>}
 */
export async function prepareStoryVideo(file, opts = {}) {
  if (!file || !(file instanceof Blob)) throw new Error(STORY_VIDEO_BAD_RU)
  if (file.size > STORY_VIDEO_MAX_BYTES) throw new Error(STORY_VIDEO_HEAVY_RU)
  const mime = baseVideoMime(file.type) ?? (String(file.type || '').startsWith('video/') ? 'video/mp4' : null)
  if (!mime) throw new Error(STORY_VIDEO_BAD_RU)
  let sec = Math.round(Number(opts.sec) || 0)
  if (!sec) sec = await probeSec(file)
  if (sec < STORY_VIDEO_MIN_SEC) throw new Error(STORY_VIDEO_BAD_RU)
  if (sec > STORY_VIDEO_MAX_SEC) throw new Error(STORY_VIDEO_LONG_RU)
  const raw = new Uint8Array(await file.arrayBuffer())
  const fixed = storyVideoApplyFaststart(raw, mime)
  const changed =
    fixed.byteLength !== raw.byteLength ||
    fixed.byteOffset !== raw.byteOffset ||
    fixed.buffer !== raw.buffer
  const outBlob = changed ? new Blob([fixed], { type: mime }) : file
  return {
    kind: 'video',
    blob: outBlob,
    mime,
    sec,
    bytes: outBlob.size,
    previewUrl: URL.createObjectURL(outBlob),
  }
}
