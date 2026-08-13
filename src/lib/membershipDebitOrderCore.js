/**
 * Порядок списания абона при первом completed.
 * Ideal: не увеличивать used, пока completed-тренировка не записана локально.
 */
export function membershipDebitShouldFollowTrainingSave() {
  return true
}

/**
 * Статический разбор порядка saveLocalWithSync в блоке завершения (для L1-аудита).
 * @param {string} sourceText
 * @returns {{ debitBeforeTraining: boolean, foundDebit: boolean, foundTraining: boolean }}
 */
export function analyzeCompleteSaveOrderInSource(sourceText) {
  const src = String(sourceText ?? '')
  const mem = src.search(/saveLocalWithSync\(\s*['"]memberships['"]/)
  const tr = src.search(/saveLocalWithSync\(\s*['"]trainings['"]/)
  return {
    foundDebit: mem >= 0,
    foundTraining: tr >= 0,
    debitBeforeTraining: mem >= 0 && tr >= 0 && mem < tr,
  }
}
