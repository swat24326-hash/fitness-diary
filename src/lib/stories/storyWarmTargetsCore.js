/**
 * Какие кадры греть до открытия кружка.
 * По умолчанию один автор: параллельный прогрев 3 тяжёлых видео делит канал
 * (на S23 «Загружаем…» 5–7 с, на быстром Wi‑Fi iPhone — мгновенно).
 * @param {{ stories?: { id: string, seen?: boolean, frames?: { id: string }[] }[] }[]} groups
 * @param {{ maxAuthors?: number, maxFrames?: number }} [opts]
 * @returns {{ storyId: string, frameId: string }[]}
 */
export function storyWarmTargets(groups, { maxAuthors = 1, maxFrames = 1 } = {}) {
  const out = []
  const seen = new Set()
  const authors = Math.max(0, Number(maxAuthors) || 0)
  const frames = Math.max(0, Number(maxFrames) || 0)
  for (const group of (groups ?? []).slice(0, authors)) {
    const list = group?.stories ?? []
    const story = list.find((s) => !s.seen) || list[0]
    if (!story?.id) continue
    for (const frame of (story.frames ?? []).slice(0, frames)) {
      const frameId = String(frame?.id || '')
      if (!frameId || seen.has(frameId)) continue
      seen.add(frameId)
      out.push({ storyId: String(story.id), frameId })
    }
  }
  return out
}
