/**
 * Настройки качества ведения на клуб (веса осей + тумблеры + % внутри осей).
 * Дефолт = текущее поведение FIT-CITY. Чистые функции — для verify и API.
 */

export const COACH_QUALITY_CONFIG_VERSION = 2

/** @typedef {{
 *   version: number,
 *   weightCare: number,
 *   weightDepth: number,
 *   weightBag: number,
 *   toggleHealthPassport: boolean,
 *   toggleNutritionMissing: boolean,
 *   toggleNutritionStale: boolean,
 *   toggleMeasures: boolean,
 *   toggleThinTrainings: boolean,
 *   toggleStuckDk: boolean,
 *   toggleStuckBz: boolean,
 *   toggleInactiveCorridor: boolean,
 *   toggleStuckScoreCap: boolean,
 *   subCarePassport: number,
 *   subCareNutritionMissing: number,
 *   subCareNutritionStale: number,
 *   subCareMeasures: number,
 *   subBagStuckDk: number,
 *   subBagStuckBz: number,
 *   subBagCorridor: number,
 * }} CoachQualityConfig */

/** @returns {CoachQualityConfig} */
export function defaultCoachQualityConfig() {
  return {
    version: COACH_QUALITY_CONFIG_VERSION,
    weightCare: 40,
    weightDepth: 40,
    weightBag: 20,
    toggleHealthPassport: true,
    toggleNutritionMissing: true,
    toggleNutritionStale: true,
    toggleMeasures: true,
    toggleThinTrainings: true,
    toggleStuckDk: true,
    toggleStuckBz: true,
    toggleInactiveCorridor: true,
    toggleStuckScoreCap: true,
    // Доли внутри оси «ведение» (сумма 100% по включённым).
    subCarePassport: 25,
    subCareNutritionMissing: 25,
    subCareNutritionStale: 25,
    subCareMeasures: 25,
    // Доли внутри оси «хвосты».
    subBagStuckDk: 40,
    subBagStuckBz: 40,
    subBagCorridor: 20,
  }
}

/**
 * @returns {{
 *   key: string,
 *   group: string,
 *   label: string,
 *   hint: string,
 *   subWeightKey?: string|null,
 * }}
 */
export function coachQualityToggleMeta() {
  return [
    {
      key: 'toggleHealthPassport',
      group: 'Ведение',
      label: 'Паспорт карты здоровья',
      hint: 'Рост, исходный вес, пол, дата у активного клиента',
      subWeightKey: 'subCarePassport',
    },
    {
      key: 'toggleNutritionMissing',
      group: 'Ведение',
      label: 'Нет плана рациона',
      hint: 'Если цель на вес/форму или вес уже ведут',
      subWeightKey: 'subCareNutritionMissing',
    },
    {
      key: 'toggleNutritionStale',
      group: 'Ведение',
      label: 'Устаревший рацион',
      hint: 'План не обновлён >7 дней после смены веса/роста',
      subWeightKey: 'subCareNutritionStale',
    },
    {
      key: 'toggleMeasures',
      group: 'Ведение',
      label: 'Обмеры',
      hint: 'Нет замера за период, если уместны или уже вели',
      subWeightKey: 'subCareMeasures',
    },
    {
      key: 'toggleThinTrainings',
      group: 'Глубина',
      label: 'Тонкие тренировки',
      hint: '1 упражнение или ≤2 подхода с данными — весь вес оси «Глубина»',
      subWeightKey: null,
    },
    {
      key: 'toggleStuckDk',
      group: 'Хвосты',
      label: 'Хвост ДК (>14 дней)',
      hint: 'Неактивный без нового абонемента и без архива',
      subWeightKey: 'subBagStuckDk',
    },
    {
      key: 'toggleStuckBz',
      group: 'Хвосты',
      label: 'Хвост после БЗ',
      hint: 'После пробной без ДК, отказа или архива',
      subWeightKey: 'subBagStuckBz',
    },
    {
      key: 'toggleInactiveCorridor',
      group: 'Хвосты',
      label: 'Коридор 8–14 дней',
      hint: 'Статус «Внимание», ещё не хвост',
      subWeightKey: 'subBagCorridor',
    },
    {
      key: 'toggleStuckScoreCap',
      group: 'Хвосты',
      label: 'Не выше 79 баллов при хвостах',
      hint: 'Ограничение итога, не доля внутри оси — процента здесь нет',
      subWeightKey: null,
    },
  ]
}

const CARE_SUB_KEYS = [
  ['toggleHealthPassport', 'subCarePassport'],
  ['toggleNutritionMissing', 'subCareNutritionMissing'],
  ['toggleNutritionStale', 'subCareNutritionStale'],
  ['toggleMeasures', 'subCareMeasures'],
]

const BAG_SUB_KEYS = [
  ['toggleStuckDk', 'subBagStuckDk'],
  ['toggleStuckBz', 'subBagStuckBz'],
  ['toggleInactiveCorridor', 'subBagCorridor'],
]

/**
 * @param {unknown} raw
 * @param {{ redistributeSubs?: boolean }} [opts]
 *   redistributeSubs — по умолчанию true (API/агрегат). В UI при вводе % — false, иначе цифры «прыгают».
 * @returns {CoachQualityConfig}
 */
export function normalizeCoachQualityConfig(raw, opts = {}) {
  const redistributeSubs = opts.redistributeSubs !== false
  const d = defaultCoachQualityConfig()
  const src = raw && typeof raw === 'object' ? raw : {}
  const bool = (key, fallback) => {
    if (!Object.prototype.hasOwnProperty.call(src, key)) return fallback
    return src[key] !== false && src[key] !== 0 && src[key] !== '0'
  }
  let weightCare = clampWeight(src.weightCare ?? src.weight_care, d.weightCare)
  let weightDepth = clampWeight(src.weightDepth ?? src.weight_depth, d.weightDepth)
  let weightBag = clampWeight(src.weightBag ?? src.weight_bag, d.weightBag)
  const sum = weightCare + weightDepth + weightBag
  if (sum <= 0) {
    weightCare = d.weightCare
    weightDepth = d.weightDepth
    weightBag = d.weightBag
  } else if (sum !== 100) {
    weightCare = Math.round((100 * weightCare) / sum)
    weightDepth = Math.round((100 * weightDepth) / sum)
    weightBag = Math.max(0, 100 - weightCare - weightDepth)
  }

  /** @type {CoachQualityConfig} */
  const cfg = {
    version: COACH_QUALITY_CONFIG_VERSION,
    weightCare,
    weightDepth,
    weightBag,
    toggleHealthPassport: bool('toggleHealthPassport', bool('toggle_health_passport', d.toggleHealthPassport)),
    toggleNutritionMissing: bool('toggleNutritionMissing', bool('toggle_nutrition_missing', d.toggleNutritionMissing)),
    toggleNutritionStale: bool('toggleNutritionStale', bool('toggle_nutrition_stale', d.toggleNutritionStale)),
    toggleMeasures: bool('toggleMeasures', bool('toggle_measures', d.toggleMeasures)),
    toggleThinTrainings: bool('toggleThinTrainings', bool('toggle_thin_trainings', d.toggleThinTrainings)),
    toggleStuckDk: bool('toggleStuckDk', bool('toggle_stuck_dk', d.toggleStuckDk)),
    toggleStuckBz: bool('toggleStuckBz', bool('toggle_stuck_bz', d.toggleStuckBz)),
    toggleInactiveCorridor: bool(
      'toggleInactiveCorridor',
      bool('toggle_inactive_corridor', d.toggleInactiveCorridor),
    ),
    toggleStuckScoreCap: bool('toggleStuckScoreCap', bool('toggle_stuck_score_cap', d.toggleStuckScoreCap)),
    subCarePassport: clampWeight(src.subCarePassport ?? src.sub_care_passport, d.subCarePassport),
    subCareNutritionMissing: clampWeight(
      src.subCareNutritionMissing ?? src.sub_care_nutrition_missing,
      d.subCareNutritionMissing,
    ),
    subCareNutritionStale: clampWeight(
      src.subCareNutritionStale ?? src.sub_care_nutrition_stale,
      d.subCareNutritionStale,
    ),
    subCareMeasures: clampWeight(src.subCareMeasures ?? src.sub_care_measures, d.subCareMeasures),
    subBagStuckDk: clampWeight(src.subBagStuckDk ?? src.sub_bag_stuck_dk, d.subBagStuckDk),
    subBagStuckBz: clampWeight(src.subBagStuckBz ?? src.sub_bag_stuck_bz, d.subBagStuckBz),
    subBagCorridor: clampWeight(src.subBagCorridor ?? src.sub_bag_corridor, d.subBagCorridor),
  }

  if (redistributeSubs) {
    redistributeSubWeights(cfg, CARE_SUB_KEYS)
    redistributeSubWeights(cfg, BAG_SUB_KEYS)
  } else {
    for (const [toggleKey, subKey] of [...CARE_SUB_KEYS, ...BAG_SUB_KEYS]) {
      if (!cfg[toggleKey]) cfg[subKey] = 0
    }
  }
  return cfg
}

/**
 * Активные доли внутри ведения (сумма 100 или {}).
 * @param {CoachQualityConfig} cfg
 */
export function resolveCareSubWeights(cfg) {
  const c = normalizeCoachQualityConfig(cfg)
  return {
    passport: c.toggleHealthPassport ? c.subCarePassport : 0,
    nutritionMissing: c.toggleNutritionMissing ? c.subCareNutritionMissing : 0,
    nutritionStale: c.toggleNutritionStale ? c.subCareNutritionStale : 0,
    measures: c.toggleMeasures ? c.subCareMeasures : 0,
  }
}

/**
 * @param {CoachQualityConfig} cfg
 */
export function resolveBagSubWeights(cfg) {
  const c = normalizeCoachQualityConfig(cfg)
  return {
    stuckDk: c.toggleStuckDk ? c.subBagStuckDk : 0,
    stuckBz: c.toggleStuckBz ? c.subBagStuckBz : 0,
    corridor: c.toggleInactiveCorridor ? c.subBagCorridor : 0,
  }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, config: CoachQualityConfig } | { ok: false, error: string }}
 */
export function validateCoachQualityConfigForSave(raw) {
  const cfg = normalizeCoachQualityConfig(raw)
  if (cfg.weightCare + cfg.weightDepth + cfg.weightBag !== 100) {
    return { ok: false, error: 'Сумма весов осей должна быть 100%' }
  }
  return { ok: true, config: cfg }
}

/**
 * @param {CoachQualityConfig} [cfg]
 */
export function coachQualityRulesHelpFromConfig(cfg) {
  const c = normalizeCoachQualityConfig(cfg, { redistributeSubs: false })
  const care = {
    passport: c.toggleHealthPassport ? c.subCarePassport : 0,
    nutritionMissing: c.toggleNutritionMissing ? c.subCareNutritionMissing : 0,
    nutritionStale: c.toggleNutritionStale ? c.subCareNutritionStale : 0,
    measures: c.toggleMeasures ? c.subCareMeasures : 0,
  }
  const bag = {
    stuckDk: c.toggleStuckDk ? c.subBagStuckDk : 0,
    stuckBz: c.toggleStuckBz ? c.subBagStuckBz : 0,
    corridor: c.toggleInactiveCorridor ? c.subBagCorridor : 0,
  }
  const careBits = []
  if (care.passport) careBits.push(`паспорт ${care.passport}%`)
  if (care.nutritionMissing) careBits.push(`нет рациона ${care.nutritionMissing}%`)
  if (care.nutritionStale) careBits.push(`устаревший рацион ${care.nutritionStale}%`)
  if (care.measures) careBits.push(`обмеры ${care.measures}%`)
  const careLine =
    careBits.length > 0
      ? `Ведение (${c.weightCare}% итога): ${careBits.join(', ')}.`
      : 'Ось ведения в оценке клуба выключена (тумблеры).'
  const depthLine = c.toggleThinTrainings
    ? `Глубина (${c.weightDepth}% итога): тонкие тренировки (1 упражнение или ≤2 подхода).`
    : 'Тонкие тренировки в оценке выключены.'
  const bagBits = []
  if (bag.stuckDk) bagBits.push(`хвост ДК ${bag.stuckDk}%`)
  if (bag.stuckBz) bagBits.push(`хвост после БЗ ${bag.stuckBz}%`)
  if (bag.corridor) bagBits.push(`коридор 8–14 ${bag.corridor}%`)
  const bagLine =
    bagBits.length > 0
      ? `Хвосты (${c.weightBag}% итога): ${bagBits.join('; ')}.`
      : 'Ось хвостов в оценке выключена.'
  const capLine = c.toggleStuckScoreCap
    ? 'Если есть хвосты — итоговый балл не выше 79.'
    : 'Ограничение «не выше 79 при хвостах» выключено.'
  return [
    'Списание занятия — норма, за него не судим.',
    careLine,
    depthLine,
    bagLine,
    'Мало данных: <8 завершённых или <3 активных — статус «Мало данных».',
    `Итоговый балл: ведение ${c.weightCare}% + глубина ${c.weightDepth}% + чистота базы ${c.weightBag}%. ${capLine} Без тренировок в периоде балла нет.`,
    'Настройки клуба — в Структуре → «Качество ведения» (одинаково для тренера и админа).',
  ]
}

/**
 * Перераспределяет % среди включённых пунктов группы → сумма 100.
 * Вызывать при сохранении / сбросе / выключении тумблера — не при каждом вводе %.
 * @param {CoachQualityConfig} cfg
 * @param {[string, string][]} pairs [toggleKey, subKey]
 */
export function redistributeSubWeights(cfg, pairs) {
  const active = pairs.filter(([toggleKey]) => cfg[toggleKey])
  if (!active.length) {
    for (const [, subKey] of pairs) cfg[subKey] = 0
    return
  }
  let sum = 0
  for (const [, subKey] of active) {
    const n = Number(cfg[subKey])
    cfg[subKey] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0
    sum += cfg[subKey]
  }
  if (sum <= 0) {
    const even = Math.floor(100 / active.length)
    let rest = 100 - even * active.length
    for (const [, subKey] of active) {
      cfg[subKey] = even + (rest > 0 ? 1 : 0)
      if (rest > 0) rest--
    }
  } else if (sum !== 100) {
    let allocated = 0
    for (let i = 0; i < active.length; i++) {
      const subKey = active[i][1]
      if (i === active.length - 1) {
        cfg[subKey] = Math.max(0, 100 - allocated)
      } else {
        cfg[subKey] = Math.round((100 * cfg[subKey]) / sum)
        allocated += cfg[subKey]
      }
    }
  }
  for (const [toggleKey, subKey] of pairs) {
    if (!cfg[toggleKey]) cfg[subKey] = 0
  }
}

/**
 * Сумма долей включённых пунктов группы (0 если все выкл).
 * @param {CoachQualityConfig} cfg
 * @param {[string, string][]} pairs
 */
export function sumEnabledSubWeights(cfg, pairs) {
  let sum = 0
  let enabled = 0
  for (const [toggleKey, subKey] of pairs) {
    if (!cfg[toggleKey]) continue
    enabled++
    sum += Number(cfg[subKey]) || 0
  }
  return { sum, enabled }
}

export { CARE_SUB_KEYS, BAG_SUB_KEYS }

function clampWeight(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
