/**
 * Отраслевые playbooks ИСКРЫ в стиле FIT-CITY (НК/ДК/УК, ПЗ/ТЗ/АЗ).
 * Seed дополняет уроки клуба из самообучения — не заменяет их.
 * scripts/verify-iskra-business-playbooks.mjs
 */

/** @typedef {{ signal_key: string, topic: string, priority: number, note: string }} IskraSeedPlaybook */

/** @type {IskraSeedPlaybook[]} */
export const ISKRA_SEED_PLAYBOOKS = [
  {
    signal_key: 'seed:plan_behind',
    topic: 'plan',
    priority: 95,
    note:
      'План отстаёт от календарного темпа: разбейте остаток месяца на недели. Ежедневно в отчёте менеджера — НК, ДК, УК и ПЗ/ТЗ/АЗ. Сначала закройте самое слабое направление (ПЗ, ТЗ или АЗ), потом добирайте структуру выручки.',
  },
  {
    signal_key: 'seed:direction_pz',
    topic: 'pz',
    priority: 90,
    note:
      'ПЗ просел: в отчёте менеджера проверьте ПЗ за 7 и 14 дней — падение ПЗ часто тянет план вниз. Усилите запись с ресепшена, пакеты персональных тренировок, контроль менеджера по ПЗ-НК/ПЗ-ДК. Цифры ПЗ — только из отчёта, не с планшетов.',
  },
  {
    signal_key: 'seed:direction_tz',
    topic: 'tz',
    priority: 88,
    note:
      'ТЗ отстаёт: разберите мини-группы и тренажёрный зал в матрице отчёта. Акцент на ТЗ-ДК и продление — действующим клиентам проще продать групповой формат, чем холодный НК.',
  },
  {
    signal_key: 'seed:direction_az',
    topic: 'az',
    priority: 86,
    note:
      'АЗ просел: проверьте аэробную зону в отчёте — групповые программы, абонементы АЗ. Сезонные акции на АЗ-УК помогают удержанию без давления на НК.',
  },
  {
    signal_key: 'seed:structure_nk',
    topic: 'nk',
    priority: 84,
    note:
      'НК слабый: воронка новых клиентов — лиды, пробные, конверсия в абонемент. В отчёте смотрите долю НК в выручке и ПЗ-НК. Без НК план к концу месяца не закрыть только продлениями.',
  },
  {
    signal_key: 'seed:structure_dk',
    topic: 'dk',
    priority: 82,
    note:
      'ДК просел: фокус на продление — звонки менеджера за 7–14 дней до окончания абонемента. В матрице отчёта ДК-УК и ПЗ-ДК — главные рычаги. ДК дешевле НК, но стабильнее для плана.',
  },
  {
    signal_key: 'seed:structure_uk',
    topic: 'uk',
    priority: 80,
    note:
      'УК слабый: удержание действующих — допродажи, апгрейд карты, кросс-продажи ПЗ/ТЗ. УК в отчёте менеджера — база месяца; просадка УК бьёт по прогнозу сильнее разовых НК.',
  },
  {
    signal_key: 'seed:inactive_sales',
    topic: 'inactive',
    priority: 78,
    note:
      'Много неактивных (без абонемента): это задача отдела продаж — обзвон, спецпредложение на ДК/УК, возврат в зал. Не смешивайте с нагрузкой тренера на планшете — здесь цель выручка и продление.',
  },
  {
    signal_key: 'seed:pnk_push',
    topic: 'pnk',
    priority: 76,
    note:
      'ПНК ниже нормы: проверьте допродажи в отчёте — питание, мерч, разовые услуги. ПНК не спасёт план сам, но добавляет маржу к закрытию месяца.',
  },
  {
    signal_key: 'seed:pz_profit_link',
    topic: 'pz_profit',
    priority: 74,
    note:
      'Выручка просела при меньшем ПЗ в отчёте менеджера: свяжите динамику ПЗ и profit_total за период — если ПЗ упали раньше выручки, бейте в запись и проведение ПЗ. Оценка только по отчёту менеджера.',
  },
  {
    signal_key: 'seed:forecast_miss',
    topic: 'forecast',
    priority: 72,
    note:
      'Прогноз не дотягивает план: не ждите конца месяца — точечные акции по слабому направлению (ПЗ/ТЗ/АЗ) и усиление НК на оставшиеся дни. Прогноз из club_finance — ориентир для решения сегодня.',
  },
  {
    signal_key: 'seed:extra_sales',
    topic: 'extra',
    priority: 70,
    note:
      'Доп. продажи (доп-НК/ДК/УК в матрице): быстрый рычаг без нового трафика — предложите действующим клиентам дополнительные услуги и пакеты в отчёте менеджера.',
  },
]

const TOPIC_BY_DIRECTION_KEY = {
  pz: 'pz',
  tz: 'tz',
  az: 'az',
}

/**
 * @param {object | null | undefined} snapshot
 * @returns {string[]}
 */
export function resolveRelevantSeedTopics(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return ['plan']

  /** @type {string[]} */
  const topics = []
  const insights = snapshot.insights ?? {}
  const plan = insights.plan ?? {}
  const planPct = Number(plan.pct ?? snapshot.sales?.plan_progress_pct) || 0

  if (plan.calendar_vs_plan === 'behind' || plan.tone === 'weak' || (planPct > 0 && planPct < 50)) {
    topics.push('plan')
  }

  const worst = insights.direction_plan?.worst
  if (worst?.key && TOPIC_BY_DIRECTION_KEY[worst.key]) {
    topics.push(TOPIC_BY_DIRECTION_KEY[worst.key])
  }

  const structure = insights.structure ?? {}
  if (structure.weak_nk_vs_dk) topics.push('nk')
  const shares = snapshot.sales?.structure_shares ?? {}
  if (Number(shares.dk) < 25 && Number(shares.nk) > 0) topics.push('dk')

  const inactive = Number(snapshot.trainer_contour?.club_roll_up?.inactive_clients_holders) || 0
  if (inactive >= 5 || insights.top_issue?.id === 'inactive_clients') topics.push('inactive')

  if (Number(snapshot.sales?.pnk_total) > 0 && Number(insights.pnk?.tone) === 'weak') topics.push('pnk')

  const cf = snapshot.club_finance?.forecast
  if (cf?.will_reach_plan === false) topics.push('forecast')

  const pz = Number(snapshot.sales?.pz_trainings_from_manager_reports) || 0
  const profit = Number(snapshot.sales?.profit_total) || 0
  if (pz > 0 && profit > 0 && worst?.key === 'pz') topics.push('pz_profit')

  if (!topics.length) topics.push('plan')
  return [...new Set(topics)]
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ limit?: number }} [opts]
 * @returns {IskraSeedPlaybook[]}
 */
export function pickSeedPlaybooksForSnapshot(snapshot, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 4)
  const topics = resolveRelevantSeedTopics(snapshot)
  const topicSet = new Set(topics)

  return ISKRA_SEED_PLAYBOOKS.filter((p) => topicSet.has(p.topic))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, limit)
}

/**
 * @param {object | null | undefined} snapshot
 * @returns {IskraSeedPlaybook | null}
 */
export function pickPrimarySeedPlaybook(snapshot) {
  return pickSeedPlaybooksForSnapshot(snapshot, { limit: 1 })[0] ?? null
}

/**
 * @param {IskraSeedPlaybook | null | undefined} playbook
 */
export function seedPlaybookActionLine(playbook) {
  const note = String(playbook?.note ?? '').trim()
  if (!note) return ''
  const first = note.split(/(?<=[.!?])\s+/)[0] || note
  return first.length > 120 ? `${first.slice(0, 117)}…` : first
}

/**
 * @param {{
 *   clubPlaybooks?: Array<{ signal_key: string, note: string }> | null,
 *   snapshot?: object | null,
 *   limit?: number,
 * }} opts
 * @returns {Array<{ signal_key: string, note: string, source?: string }>}
 */
export function mergePlaybooksForPrompt(opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 8)
  const club = Array.isArray(opts.clubPlaybooks) ? opts.clubPlaybooks : []
  const seeds = pickSeedPlaybooksForSnapshot(opts.snapshot, { limit: 6 })

  const byKey = new Map()
  for (const s of seeds) {
    byKey.set(s.signal_key, { signal_key: s.signal_key, note: s.note, source: 'seed' })
  }
  for (const c of club) {
    const key = String(c?.signal_key ?? '').trim()
    const note = String(c?.note ?? '').trim()
    if (!key || !note) continue
    byKey.set(key, { signal_key: key, note, source: 'club' })
  }

  const merged = [...byKey.values()]
  const clubFirst = merged.sort((a, b) => {
    if (a.source === b.source) return 0
    return a.source === 'club' ? -1 : 1
  })

  return clubFirst.slice(0, limit).map(({ signal_key, note }) => ({ signal_key, note }))
}

/**
 * Текст для system prompt (кратко).
 * @param {object | null | undefined} snapshot
 */
export function buildSeedPlaybooksPromptRule(snapshot) {
  const picks = pickSeedPlaybooksForSnapshot(snapshot, { limit: 3 })
  if (!picks.length) return ''
  const lines = picks.map((p) => `· [${p.topic}] ${p.note}`)
  return [
    'ОТРАСЛЕВЫЕ ШАБЛОНЫ FIT-CITY (используй как опору для советов, не противоречь урокам клуба):',
    ...lines,
  ].join('\n')
}
