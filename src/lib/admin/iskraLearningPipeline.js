/**
 * Пайплайн самообучения ИСКРЫ: bundle → prompt → ранжирование подсказок.
 */

import { buildLearnedPromptAppend, rankProactiveHintsByLearning } from './iskraLearningCore.js'
import { extractInactionLessons } from './iskraInactionLearningCore.js'

/**
 * @typedef {import('./iskraLearningCore.js').IskraLearningBundle} IskraLearningBundle
 */

/**
 * @param {{
 *   learningBundle?: IskraLearningBundle | null,
 * }} [opts]
 */
export function buildIskraLearningContext(opts = {}) {
  const bundle = opts.learningBundle ?? { signals: [], playbooks: [], phase: 'collect' }
  const inactionLessons = extractInactionLessons(bundle.signals)
  return {
    bundle,
    hasPlaybooks: (bundle.playbooks?.length ?? 0) > 0,
    signalCount: bundle.signals?.length ?? 0,
    inactionLessons,
  }
}

/**
 * @param {string} baseAppend
 * @param {ReturnType<typeof buildIskraLearningContext>} learningCtx
 */
export function mergeLearningIntoPromptAppend(baseAppend, learningCtx) {
  const learned = buildLearnedPromptAppend(learningCtx.bundle, {
    inactionLessons: learningCtx.inactionLessons,
  })
  return [baseAppend, learned].filter(Boolean).join('\n\n')
}

/**
 * @param {Array<{ id: string }>} hints
 * @param {ReturnType<typeof buildIskraLearningContext>} learningCtx
 */
export function rankHintsWithLearning(hints, learningCtx) {
  return rankProactiveHintsByLearning(hints, learningCtx.bundle?.signals ?? [])
}

/**
 * @param {ReturnType<typeof buildIskraLearningContext>} learningCtx
 */
export function buildLearningMetaForResponse(learningCtx) {
  return {
    learning_phase: learningCtx.bundle?.phase ?? 'collect',
    learning_signals: learningCtx.signalCount,
    learning_playbooks: learningCtx.bundle?.playbooks?.length ?? 0,
  }
}
