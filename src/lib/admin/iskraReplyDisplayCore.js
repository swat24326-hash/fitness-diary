/**
 * Разбор ответа ИСКРЫ для экрана: лид + секции, без сырого markdown.
 * scripts/verify-iskra-reply-display.mjs
 */

const SECTION_LABELS = ['Факты', 'Вывод', 'Рекомендации', 'Контрольная точка', 'Риск', 'Шаги']

const FLUFF_OPENER_RE =
  /^(?:на связи\.?\s*)?(?:данные приняты\.?\s*)?(?:сводка\.?\s*)?(?:по базе объекта\.?\s*)?/i

/** @param {string} text */
export function stripIskraReplyMarkdown(text) {
  return String(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text */
export function stripIskraFluffOpener(text) {
  let s = String(text ?? '').trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(FLUFF_OPENER_RE, '').trim()
  }
  return s
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitIskraNumberedItems(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  const parts = raw.split(/(?=\d+\.\s)/).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) return parts
  return [raw]
}

/**
 * @param {string} text
 * @returns {{ lead: string, sections: Array<{ label: string, items: string[] }>, paragraphs: string[] }}
 */
export function parseIskraReplyBlocks(text) {
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim()

  if (!normalized) {
    return { lead: '', sections: [], paragraphs: [] }
  }

  const sectionRe = new RegExp(
    `(?:^|\\s)(?:\\*\\*)?(${SECTION_LABELS.join('|')})(?:\\*\\*)?\\s*:\\s*`,
    'gi',
  )
  const matches = [...normalized.matchAll(sectionRe)]

  if (matches.length) {
    const lead = stripIskraFluffOpener(
      normalized.slice(0, matches[0].index).replace(/\n+/g, ' ').trim(),
    )
    const sections = matches.map((match, idx) => {
      const label = String(match[1] ?? '').trim()
      const start = match.index + match[0].length
      const end = idx + 1 < matches.length ? matches[idx + 1].index : normalized.length
      const body = normalized
        .slice(start, end)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .trim()
      return { label, items: splitIskraNumberedItems(body) }
    })
    return { lead, sections: sections.filter((s) => s.label && s.items.length), paragraphs: [] }
  }

  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (paragraphs.length <= 1) {
    const single = stripIskraFluffOpener(paragraphs[0] ?? normalized)
    const sentences = single.match(/[^.!?…]+[.!?…]+/g)
    if (sentences && sentences.length > 1) {
      const lead = sentences[0].trim()
      const rest = sentences.slice(1).join(' ').trim()
      return {
        lead,
        sections: rest ? [{ label: '', items: [rest] }] : [],
        paragraphs: [],
      }
    }
    return { lead: single, sections: [], paragraphs: [] }
  }
  const lead = stripIskraFluffOpener(paragraphs[0])
  return { lead, sections: [], paragraphs: paragraphs.slice(1) }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function iskraReplyLooksLikeWallOfText(text) {
  const raw = String(text ?? '').trim()
  if (raw.length < 220) return false
  const blocks = parseIskraReplyBlocks(raw)
  if (blocks.sections.length >= 2) return false
  const paraCount = raw.split(/\n\n+/).filter(Boolean).length
  return paraCount <= 1
}
