/**
 * Выкладка смешанной ленты: фото — JSON, каждое видео — отдельный бинарный publish.
 * Порядок кадров сохраняем отдельными сторис одного автора (кольцо склеивает).
 */

/**
 * @param {Array<{ kind?: string }>} frames
 * @returns {Array<Array<{ kind?: string }>>} пачки: фото подряд или одно видео
 */
export function storyPublishBatches(frames) {
  const list = Array.isArray(frames) ? frames : []
  const batches = []
  let photos = []
  const flushPhotos = () => {
    if (!photos.length) return
    batches.push(photos)
    photos = []
  }
  for (const frame of list) {
    if (frame?.kind === 'video') {
      flushPhotos()
      batches.push([frame])
    } else {
      photos.push(frame)
    }
  }
  flushPhotos()
  return batches
}
