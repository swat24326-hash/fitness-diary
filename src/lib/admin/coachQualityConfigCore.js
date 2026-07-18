/**
 * Настройки качества ведения на клуб (веса осей + тумблеры правил).
 * Дефолт = текущее поведение FIT-CITY. Чистые функции — для verify и API.
 */

export const COACH_QUALITY_CONFIG_VERSION = 1

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
  }
}

/**
 * Подписи тумблеров для UI структуры.
 * @returns {{ key: keyof CoachQualityConfig, group: string, label: string, hint: string }[]}
 */
export function coachQualityToggleMeta() {
  return [
    {
      key: 'toggleHealthPassport',
      group: 'Ведение',
      label: 'Паспорт карты здоровья',
      hint: 'Рост, исходный вес, пол, дата у активного клиента',
    },
    {
      key: 'toggleNutritionMissing',
      group: 'Ведение',
      label: 'Нет плана рациона',
      hint: 'Если цель на вес/форму или вес уже ведут',
    },
    {
      key: 'toggleNutritionStale',
      group: 'Ведение',
      label: 'Устаревший рацион',
      hint: 'План не обновлён >7 дней после смены веса/роста',
    },
    {
      key: 'toggleMeasures',
      group: 'Ведение',
      label: 'Обмеры',
      hint: 'Нет замера за период, если уместны или уже вели',
    },
    {
      key: 'toggleThinTrainings',
      group: 'Глубина',
      label: 'Тонкие тренировки',
      hint: '1 упражнение или ≤2 подхода с данными',
    },
    {
      key: 'toggleStuckDk',
      group: 'Хвосты',
      label: 'Stuck ДК (>14 дн.)',
      hint: 'Неактивный без нового абонемента и архива',
    },
    {
      key: 'toggleStuckBz',
      group: 'Хвосты',
      label: 'Stuck после БЗ',
      hint: 'После пробной без ДК / отказа / архива',
    },
    {
      key: 'toggleInactiveCorridor',
      group: 'Хвосты',
      label: 'Коридор 8–14 дней',
      hint: 'Даёт статус «Внимание», ещё не stuck',
    },
    {
      key: 'toggleStuckScoreCap',
      group: 'Хвосты',
      label: 'Потолок балла 79 при stuck',
      hint: 'Хвост >14 не даёт красивый итог',
    },
  ]
}

/**
 * @param {unknown} raw
 * @returns {CoachQualityConfig}
 */
export function normalizeCoachQualityConfig(raw) {
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
  return {
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
  const c = normalizeCoachQualityConfig(cfg)
  const careBits = []
  if (c.toggleHealthPassport) careBits.push('паспорт карты')
  if (c.toggleNutritionMissing) careBits.push('наличие рациона')
  if (c.toggleNutritionStale) careBits.push('свежесть рациона')
  if (c.toggleMeasures) careBits.push('обмеры')
  const careLine =
    careBits.length > 0
      ? `Ведение активного клиента учитывает: ${careBits.join(', ')}.`
      : 'Ось ведения в оценке клуба выключена (тумблеры).'
  const depthLine = c.toggleThinTrainings
    ? 'Тонкая тренировка: 1 упражнение или ≤2 подхода с данными.'
    : 'Тонкие тренировки в оценке выключены.'
  const bagBits = []
  if (c.toggleStuckDk) bagBits.push('stuck ДК >14 дн.')
  if (c.toggleStuckBz) bagBits.push('хвост после БЗ')
  if (c.toggleInactiveCorridor) bagBits.push('коридор 8–14 дн.')
  const bagLine =
    bagBits.length > 0
      ? `Хвосты: ${bagBits.join('; ')}.`
      : 'Ось хвостов в оценке выключена (кроме отображения базы).'
  const capLine = c.toggleStuckScoreCap
    ? 'При stuck потолок итогового балла 79.'
    : 'Потолок 79 при stuck выключен.'
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

function clampWeight(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
