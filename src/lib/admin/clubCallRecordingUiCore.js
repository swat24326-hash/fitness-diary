/**
 * UI-состояние виджета «длительность + запись» в журнале звонков.
 * Яркая — дозвон и есть файл; бледная — файл есть без дозвона;
 * empty — исход финальный, файла нет (иконка тусклая); none — набор/сбой (только время).
 */
import {
  normalizeClubCallOutcome,
  normalizeClubCallRecordingUrl,
} from './clubCallOutcomeCore.js'

/**
 * @param {unknown} row
 * @returns {string | null}
 */
export function clubCallRecordingUrlOf(row) {
  return normalizeClubCallRecordingUrl(row?.recording_url) || null
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
export function clubCallRecordingIsTalk(row) {
  if (String(row?.status ?? 'ok').toLowerCase() === 'fail') return false
  if (row?.answered === true) return true
  return normalizeClubCallOutcome(row?.outcome) === 'answered'
}

/**
 * Финальный исход с линии (не «Набор…» и не сбой команды).
 * @param {unknown} row
 * @returns {boolean}
 */
export function clubCallRecordingSlotRelevant(row) {
  if (String(row?.status ?? 'ok').toLowerCase() === 'fail') return false
  const outcome = normalizeClubCallOutcome(row?.outcome)
  return outcome === 'answered' || outcome === 'missed' || outcome === 'short' || outcome === 'unknown'
}

/**
 * @typedef {'none' | 'bright' | 'pale' | 'empty'} ClubCallRecordingUiTone
 *
 * @param {unknown} row
 * @returns {{
 *   tone: ClubCallRecordingUiTone,
 *   url: string | null,
 *   playable: boolean,
 *   title: string,
 * }}
 */
export function resolveClubCallRecordingUi(row) {
  const url = clubCallRecordingUrlOf(row)
  const talk = clubCallRecordingIsTalk(row)

  if (url) {
    if (talk) {
      return {
        tone: 'bright',
        url,
        playable: true,
        title: 'Есть запись разговора — открыть плеер',
      }
    }
    return {
      tone: 'pale',
      url,
      playable: true,
      title: 'Файл есть, но дозвона не было — открыть плеер',
    }
  }

  if (clubCallRecordingSlotRelevant(row)) {
    return {
      tone: 'empty',
      url: null,
      playable: false,
      title: talk ? 'Дозвон был, файл записи ещё не пришёл' : 'Записи нет',
    }
  }

  return {
    tone: 'none',
    url: null,
    playable: false,
    title: '',
  }
}
