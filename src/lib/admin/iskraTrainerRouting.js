/** Распознавание тренера в свободном тексте для ЭВС «ИСКРА». */

export function normalizeIskraLookupText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/** Убрать обращение «Искра, …» в начале фразы. */
export function stripIskraAddressPrefix(userMessage) {
  return String(userMessage ?? '')
    .trim()
    .replace(/^(искра|эвс)\s*[,:]?\s*/i, '')
    .trim()
}

/**
 * Вопрос про конкретного тренера / сводку тренера — не самопрезентация.
 * @param {string} userMessage
 */
export function isTrainerFocusedQuestion(userMessage) {
  const raw = stripIskraAddressPrefix(userMessage)
  const s = normalizeIskraLookupText(raw)
  if (!s) return false

  if (/по\s+тренер|сводк\w*\s+по\s+тренер|сводк\w*.*тренер|тренер\w*\s+[а-яa-z]{2,}/.test(s)) {
    return true
  }

  if (/тренер|инструктор/.test(s) && /сводк|итог|статистик|зарплат|тренировк|клиент|месяц/.test(s)) {
    return true
  }

  return false
}

/**
 * @param {string} userMessage
 * @param {Array<{ trainer_id?: string, trainer_name?: string }>} trainers
 * @returns {string | null}
 */
export function resolveTrainerIdFromMessage(userMessage, trainers) {
  const list = Array.isArray(trainers) ? trainers : []
  if (!list.length) return null

  const raw = stripIskraAddressPrefix(userMessage)
  const s = normalizeIskraLookupText(raw)

  let queryName = ''
  const explicit = s.match(/(?:по\s+)?тренер(?:у|а|ом)?\s+([а-яa-z][а-яa-z\s-]{0,40})/)
  if (explicit?.[1]) {
    queryName = explicit[1]
      .trim()
      .replace(/\s+за\s+(этот\s+)?месяц.*$/, '')
      .replace(/\s+за\s+.*$/, '')
      .trim()
  }

  if (!queryName) {
    const cap = raw.match(/тренер(?:у|а|ом)?\s+([А-ЯЁA-Z][а-яёa-z]+)/i)
    if (cap?.[1]) queryName = normalizeIskraLookupText(cap[1])
  }

  if (!queryName) return null

  let bestId = null
  let bestScore = 0

  for (const tr of list) {
    const id = String(tr?.trainer_id ?? '').trim()
    const full = normalizeIskraLookupText(tr?.trainer_name)
    if (!id || !full || full === '—') continue

    let score = 0
    if (full === queryName) score = 100
    else if (full.includes(queryName) || queryName.includes(full)) score = 85
    else {
      const parts = full.split(/\s+/).filter(Boolean)
      if (parts.some((p) => p === queryName || p.startsWith(queryName) || queryName.startsWith(p))) {
        score = 75
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestId = id
    }
  }

  return bestScore >= 75 ? bestId : null
}
