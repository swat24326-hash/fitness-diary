/**
 * Оценка клиентом: один раз после последней тренировки абонемента (5★ с половинами).
 * Закладка kinds homework/nutrition — тот же UI позже.
 */

export const CLIENT_RATING_KINDS = Object.freeze({
  membership: 'membership',
  homework: 'homework',
  nutrition: 'nutrition',
})

export const CLIENT_RATING_PATH = '/me/rate'

/** Заголовки для ленты, push и экрана. */
export const CLIENT_RATING_COPY = Object.freeze({
  membership: Object.freeze({
    title: 'Оцените прошедшие тренировки',
    subtitle: 'Абонемент закончился — скажите, как прошло',
    pushBody: 'Оцените прошедшие тренировки',
    thanks: 'Спасибо за оценку',
  }),
  homework: Object.freeze({
    title: 'Как задание?',
    subtitle: 'Коротко — насколько подошло',
    pushBody: 'Оцените задание от тренера',
    thanks: 'Спасибо за оценку',
  }),
  nutrition: Object.freeze({
    title: 'Как рацион?',
    subtitle: 'Коротко — насколько удобно было есть по плану',
    pushBody: 'Оцените рацион от тренера',
    thanks: 'Спасибо за оценку',
  }),
})

/**
 * Пакет с лимитом занятий исчерпан (used ≥ total). Безлимитные / total=0 — не спрашиваем.
 * @param {{ total_trainings?: number, used_trainings?: number } | null | undefined} m
 */
export function shouldAskMembershipRating(m) {
  const total = Number(m?.total_trainings ?? 0)
  const used = Number(m?.used_trainings ?? 0)
  if (!(Number.isFinite(total) && total > 0)) return false
  if (!(Number.isFinite(used) && used >= total)) return false
  return true
}

/**
 * Оценка 1…5 с шагом 0.5 (как в Яндексе). Иначе null.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeRatingScore(raw) {
  const n = Math.round(Number(raw) * 2) / 2
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return n
}

/** Подпись «4,5» для UI. */
export function formatRatingScoreRu(score) {
  const n = normalizeRatingScore(score)
  if (n == null) return ''
  return String(n).replace('.', ',')
}

/**
 * Позиция пальца / клика на ряду звёзд → score.
 * @param {number} ratio — 0…1 по ширине ряда
 */
export function scoreFromStarRatio(ratio) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0))
  const raw = r * 5
  const stepped = Math.max(1, Math.min(5, Math.ceil(raw * 2) / 2))
  return stepped
}

export function clientRatingDeepLink(id) {
  const rid = String(id ?? '').trim()
  return rid ? `${CLIENT_RATING_PATH}/${rid}` : CLIENT_RATING_PATH
}

export function clientRatingCopy(kind) {
  return CLIENT_RATING_COPY[kind] ?? CLIENT_RATING_COPY.membership
}

/**
 * Белый список строки для клиента (лента / экран).
 * @param {object} row
 */
export function publicClientRating(row) {
  if (!row?.id) return null
  const kind = String(row.kind ?? '')
  if (!Object.values(CLIENT_RATING_KINDS).includes(kind)) return null
  const copy = clientRatingCopy(kind)
  const answered = Boolean(row.answered_at)
  return {
    id: String(row.id),
    kind,
    title: copy.title,
    body: answered
      ? `${copy.thanks}${row.score != null ? ` · ${formatRatingScoreRu(row.score)}` : ''}`
      : copy.subtitle,
    deep_link: clientRatingDeepLink(row.id),
    created_at: String(row.requested_at ?? row.created_at ?? ''),
    read_at: answered || row.dismissed_at ? String(row.answered_at || row.dismissed_at) : null,
    score: row.score != null ? normalizeRatingScore(row.score) : null,
    comment: answered && row.comment != null ? String(row.comment).slice(0, 300) : null,
    answered_at: row.answered_at ? String(row.answered_at) : null,
  }
}
