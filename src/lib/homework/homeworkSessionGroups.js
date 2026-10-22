/**
 * Блоки авто-ДЗ «Занятие А · Разминка» собираются в занятия, чтобы экран раскрывал их по одному.
 */

const SESSION_RE = /^Занятие ([А-ЯЁ]) · (.+)$/

/**
 * @param {{ label?: string, exercises?: object[] }[]} blocks
 * @returns {{ sessions: { key: string, parts: { title: string, block: object, blockIdx: number }[] }[], rest: { block: object, blockIdx: number }[] }}
 */
export function groupHomeworkSessionBlocks(blocks) {
  const sessions = []
  const rest = []
  const list = Array.isArray(blocks) ? blocks : []
  for (let blockIdx = 0; blockIdx < list.length; blockIdx++) {
    const block = list[blockIdx]
    const match = SESSION_RE.exec(String(block?.label ?? ''))
    if (!match) {
      rest.push({ block, blockIdx })
      continue
    }
    let session = sessions.find((s) => s.key === match[1])
    if (!session) {
      session = { key: match[1], parts: [] }
      sessions.push(session)
    }
    session.parts.push({ title: match[2], block, blockIdx })
  }
  return { sessions, rest }
}
