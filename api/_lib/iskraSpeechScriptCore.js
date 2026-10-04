/**
 * Текст ИСКРЫ «для уха»: модель пишет числа и сокращения словами в нужном падеже.
 * Правила склонения регулярками не решаются («при плане двадцати», «по потенциальным новым клиентам»).
 */
import { ISKRA_SPEECH_ABBREVIATIONS } from '../../src/lib/admin/iskraReplyPhrasing.js'

export const ISKRA_SPEECH_SCRIPT_MAX_INPUT = 1500

const GLOSSARY = { ...ISKRA_SPEECH_ABBREVIATIONS, ЗП: 'зарплата' }

const SYSTEM_PROMPT = [
  'Ты готовишь текст для синтеза речи на русском. Перепиши сообщение так, как его произнёс бы человек вслух.',
  'Все числа, проценты, суммы, даты и диапазоны напиши словами, согласовав род, число и падеж с соседними словами: «при плане двадцати», «у трёх тренеров», «на семьдесят процентов», «четыреста пятьдесят тысяч рублей».',
  `Сокращения расшифруй в нужном падеже: ${Object.entries(GLOSSARY).map(([k, v]) => `${k} — ${v}`).join('; ')}.`,
  'Убери разметку, списки и символы; перечни сделай связной речью через запятые.',
  'Смысл и факты не меняй, ничего не добавляй и не выбрасывай. Ответь только готовым текстом.',
].join('\n')

/** @param {string} text */
export function clipIskraSpeechInput(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (raw.length <= ISKRA_SPEECH_SCRIPT_MAX_INPUT) return raw
  const cut = raw.slice(0, ISKRA_SPEECH_SCRIPT_MAX_INPUT)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim()
}

/**
 * Запрос в формате buildGeminiGeneratePayload — уходит через callIskraLlm.
 * @param {string} text
 */
export function buildIskraSpeechScriptPayload(text) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: clipIskraSpeechInput(text) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
    generationConfigRetry: { temperature: 0.1, maxOutputTokens: 2500 },
    responseMode: 'standard',
  }
}

/**
 * Ответ модели годится, только если похож на пересказ того же текста по длине.
 * Иначе озвучиваем исходник — движок прочтёт цифры сам.
 * @param {string} reply
 * @param {string} source
 */
export function pickIskraSpeechScript(reply, source) {
  const base = clipIskraSpeechInput(source)
  const s = String(reply ?? '')
    .replace(/[*_`#>|~[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return { text: base, source: 'raw' }
  if (s.length < base.length * 0.6 || s.length > base.length * 4 + 200) return { text: base, source: 'raw' }
  return { text: s, source: 'llm' }
}
