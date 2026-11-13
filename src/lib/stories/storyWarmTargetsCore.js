/**
 * Какие кадры греть до открытия кружка (как прогрев в Telegram, без стрима API).
 * @param {{ stories?: { id: string, seen?: boolean, frames?: { id: string }[] }[] }[]} groups
 * @param {{ maxAuthors?: number, maxFrames?: number }} [opts]
 * @returns {{ storyId: string, frameId: string }[]}
 */
export function storyWarmTargets(groups, { maxAuthors = 3, maxFrames = 1 } = {}) {
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
