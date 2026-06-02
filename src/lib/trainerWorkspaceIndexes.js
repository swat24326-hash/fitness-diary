/**
 * Индексы по тренировкам для списка клиентов (без O(клиенты × тренировки) на каждый рендер).
 */

/** @param {object[]} trainings */
export function buildTrainingsByClientId(trainings) {
  /** @type {Record<string, object[]>} */
  const map = {}
  for (const t of trainings ?? []) {
    const cid = t?.client_id
    if (!cid) continue
    const key = String(cid)
    if (!map[key]) map[key] = []
    map[key].push(t)
  }
  return map
}

function trainingSortKey(t) {
  return String(t?.date ?? t?.created_at?.slice(0, 10) ?? '')
}

/** Последняя дата тренировки по client_id (ISO YYYY-MM-DD или '—'). */
export function buildLastTrainingDateByClientId(trainings) {
  const byClient = buildTrainingsByClientId(trainings)
  /** @type {Record<string, string>} */
  const last = {}
  for (const [cid, list] of Object.entries(byClient)) {
    let best = ''
    for (const t of list) {
      const k = trainingSortKey(t)
      if (k && k > best) best = k
    }
    last[cid] = best || '—'
  }
  return last
}
