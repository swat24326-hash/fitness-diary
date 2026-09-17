/**
 * Парсинг сплошного текста клип-карты / переписки → поля заявки тренеру.
 * Без React / IDB.
 */

import { formatClientName } from '../clientNameFormat.js'
import { normalizeSalesCardNumber, normalizeSalesPhoneDigits } from './salesClientMatchCore.js'
import { matchMembershipTypeByExcelLabel } from '../priceList/priceListCore.js'

/** Слова, на которых обрываем ФИО / имя тренера в одной строке с другими полями. */
const NAME_STOP =
  /(?:дата|рожд|тел(?:ефон)?|phone|карт|тренер|клип|абонемент|тип|тренир|занимается|подпись|№|номер|coach|vip|действие|оплат)/i

/**
 * @param {string} s
 * @returns {string|null}
 */
function toIsoDate(s) {
  const t = String(s ?? '').trim()
  const dmy = t.match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

/**
 * Обрезать хвост имени до стоп-слова / лишних пробелов.
 * @param {string} raw
 * @param {number} [maxWords]
 */
function trimPersonName(raw, maxWords = 4) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const stop = s.search(NAME_STOP)
  if (stop > 0) s = s.slice(0, stop).trim()
  const words = s.split(/\s+/).filter(Boolean).slice(0, maxWords)
  return formatClientName(words.join(' '))
}

/**
 * Российский телефон: сначала 11 цифр (7/8…), не 10 без префикса.
 * @param {string} text
 * @returns {string} как для формы (обычно 8XXXXXXXXXX)
 */
function extractRuPhoneForForm(text) {
  const labeled = text.match(
    /(?:тел(?:ефон)?|phone)\s*[:.\-–—]?\s*((?:\+?7|8)?[\s(]*\d{3}[\s)]*\d{3}[\s-]?\d{2}[\s-]?\d{2})/i,
  )
  const candidate = labeled?.[1] ?? text.match(/(?:\+?7|8)[\s(]*\d{3}[\s)]*\d{3}[\s-]?\d{2}[\s-]?\d{2}/)?.[0]
  if (!candidate) return ''
  const digits = normalizeSalesPhoneDigits(candidate)
  if (digits.length < 10) return ''
  if (digits.length === 11 && digits.startsWith('7')) return `8${digits.slice(1)}`
  return digits
}

/**
 * Число занятий с клип-карты 1С: «тренировки(ок) 12», не год «2026 Тренер».
 * @param {string} text
 * @returns {number|null}
 */
function extractTotalTrainings(text) {
  const afterOk = text.match(/тренировк[аиуеы]?\s*\(\s*ок\s*\)\s*(\d{1,3})\b/i)
  if (afterOk) {
    const n = Number(afterOk[1])
    if (Number.isFinite(n) && n > 0 && n <= 200) return n
  }
  const afterWord = text.match(
    /(?:на\s+)?тренировк[аиуеы]?(?:\s*\(\s*ок\s*\))?\s*[:.\-–—]?\s*(\d{1,3})\b/i,
  )
  if (afterWord) {
    const n = Number(afterWord[1])
    if (Number.isFinite(n) && n > 0 && n <= 200) return n
  }
  const beforeWord = text.match(/(\d{1,3})\s*(?:трениров(?:ок|ки|ка)?|заняти[яйе]|посещени[яйе])\b/i)
  if (beforeWord) {
    const n = Number(beforeWord[1])
    if (Number.isFinite(n) && n > 0 && n <= 200) return n
  }
  return null
}

/**
 * Парсинг типичного текста клип-карты / переписки → поля заявки.
 * @param {string} raw
 * @returns {{
 *   cardNumber: string,
 *   phone: string,
 *   name: string,
 *   totalTrainings: number|null,
 *   membershipTypeLabel: string,
 *   startDate: string|null,
 *   endDate: string|null,
 *   trainerHint: string,
 *   birthDate: string|null,
 *   reason: string,
 *   warnings: string[],
 *   understood: string[],
 * }}
 */
export function parseSaleClipPasteText(raw) {
  const text = String(raw ?? '').trim()
  const warnings = []
  const understood = []
  if (!text) {
    return {
      cardNumber: '',
      phone: '',
      name: '',
      totalTrainings: null,
      membershipTypeLabel: '',
      startDate: null,
      endDate: null,
      trainerHint: '',
      birthDate: null,
      reason: 'Пустой текст — вставьте текст с клип-карты или из переписки',
      warnings: ['Пустой текст'],
      understood: [],
    }
  }

  let cardNumber = ''
  const cardLabeled = text.match(
    /(?:№\s*)?карт(?:ы|а|е)?\s*[:.]?\s*([a-zа-яё]?\d{3,6})\b/i,
  )
  if (cardLabeled) cardNumber = normalizeSalesCardNumber(cardLabeled[1])
  if (!cardNumber) {
    const cardM = text.match(/(?:карт[аые]?|card|№)\s*[:.]?\s*([a-zа-яё]?\d{3,6})/i)
    if (cardM) cardNumber = normalizeSalesCardNumber(cardM[1])
  }
  if (cardNumber) understood.push(`карта ${cardNumber}`)

  const phone = extractRuPhoneForForm(text)
  if (phone) understood.push('телефон')

  let name = ''
  const fioM = text.match(
    /(?:фио|клиент|имя)\s*[:.\-–—]?\s*([а-яёa-z\s\-']{5,80})/i,
  )
  if (fioM) name = trimPersonName(fioM[1], 4)
  if (!name) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (NAME_STOP.test(line) && !/^(?:фио|клиент|имя)\b/i.test(line)) continue
      if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(line)) continue
      const cleaned = trimPersonName(line, 4)
      if (cleaned && /^[а-яёa-z\s\-']{5,80}$/i.test(cleaned)) {
        name = cleaned
        break
      }
    }
  }
  if (name) understood.push(`ФИО ${name}`)

  const totalTrainings = extractTotalTrainings(text)
  if (totalTrainings != null) understood.push(`${totalTrainings} тренировок`)

  let membershipTypeLabel = ''
  const typeCardM = text.match(/тип\s*карты\s*[:.\-–—]?\s*([^\n,;]{2,40})/i)
  if (typeCardM) {
    membershipTypeLabel = typeCardM[1].trim().replace(/\s+/g, ' ')
  } else {
    const typeM = text.match(/(?:абонемент|тариф|пакет)\s*[:.\-–—]?\s*([^\n,;]{2,40})/i)
    if (typeM) membershipTypeLabel = typeM[1].trim().replace(/\s+/g, ' ')
  }
  if (!membershipTypeLabel) {
    const vipM = text.match(/\b(VIP\s*\d+|БЗ|ПНК|без\s*лимит[а]?|Elite|Diamond|Platinum|Gold)\b/i)
    if (vipM) membershipTypeLabel = vipM[1].replace(/\s+/g, ' ').trim()
  }
  if (membershipTypeLabel) {
    membershipTypeLabel = membershipTypeLabel.replace(/^(?:карты|карта)\s*[:.\-–—]?\s*/i, '').trim()
    understood.push(`тип «${membershipTypeLabel}»`)
  }

  let startDate = null
  let endDate = null
  const rangeFromTo = text.match(
    /(?:действи[ея]\s*карты\s*)?с\s+(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})\s+по\s+(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i,
  )
  if (rangeFromTo) {
    startDate = toIsoDate(rangeFromTo[1])
    endDate = toIsoDate(rangeFromTo[2])
  }
  if (!startDate || !endDate) {
    const rangeM = text.match(
      /(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})\s*[-–—]+\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/,
    )
    if (rangeM) {
      startDate = startDate || toIsoDate(rangeM[1])
      endDate = endDate || toIsoDate(rangeM[2])
    }
  }
  if (!startDate) {
    const sm = text.match(/(?:начал|start)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i)
    if (sm) startDate = toIsoDate(sm[1])
  }
  if (!endDate) {
    const em = text.match(/(?:оконч|end)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i)
    if (em) endDate = toIsoDate(em[1])
  }
  if (startDate) understood.push(`начало ${startDate}`)
  if (endDate) understood.push(`окончание ${endDate}`)

  let birthDate = null
  const bdM = text.match(
    /(?:(?:дат[аы]\s*)?рожд[а-яё]*|др|birth)\s*[:.\-–—]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i,
  )
  if (bdM) {
    birthDate = toIsoDate(bdM[1])
    if (birthDate) understood.push('дата рождения')
  }

  let trainerHint = ''
  const thM = text.match(/(?:тренер|coach)\s*[:.\-–—]?\s*([а-яёa-z\s\-']{2,60})/i)
  if (thM) {
    trainerHint = trimPersonName(thM[1], 3)
    if (trainerHint) understood.push(`тренер «${trainerHint}»`)
  }

  if (!cardNumber && !phone) {
    warnings.push('Не нашла карту и телефон — допишите вручную')
  } else if (!cardNumber) {
    warnings.push('Нет номера карты — поиск слабый')
  }
  if (!name) warnings.push('Не нашла ФИО — допишите')
  if (!trainerHint) warnings.push('В тексте нет тренера — выберите в списке')

  const reason = understood.length
    ? `Поняла: ${understood.join(', ')}`
    : 'Программа почти ничего не поняла — заполните поля вручную'

  return {
    cardNumber,
    phone,
    name,
    totalTrainings,
    membershipTypeLabel,
    startDate,
    endDate,
    trainerHint,
    birthDate,
    reason,
    warnings,
    understood,
  }
}

/**
 * Парсинг «входящего» текста: карта / телефон / ФИО (эвристика).
 * @param {string} raw
 */
export function parseEveningInboundText(raw) {
  const full = parseSaleClipPasteText(raw)
  return {
    cardNumber: full.cardNumber,
    phone: full.phone,
    name: full.name,
    reason: full.reason,
  }
}

/**
 * Найти тренера по подсказке из текста (фамилия / часть имени).
 * @param {object[]} trainers
 * @param {string} hint
 * @returns {{ status: 'none'|'one'|'conflict', trainer?: object, matches: object[], reason: string }}
 */
export function matchTrainerByNameHint(trainers, hint) {
  const q = String(hint ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!q || q.length < 2) {
    return { status: 'none', matches: [], reason: 'Нет имени тренера в тексте' }
  }
  const list = (trainers ?? []).filter((t) => t && !String(t.name ?? '').toLowerCase().includes('не назначен'))
  const tokens = q.split(/\s+/).filter(Boolean)
  const surname = tokens[0] || q
  const matches = list.filter((t) => {
    const n = String(t.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (!n) return false
    if (n === q || n.includes(q) || q.includes(n)) return true
    const parts = n.split(/\s+/)
    if (parts.some((part) => part === surname || part.startsWith(surname) || surname.startsWith(part))) {
      return true
    }
    return tokens.length > 1 && tokens.every((tok) => parts.some((p) => p.startsWith(tok) || tok.startsWith(p)))
  })
  if (matches.length === 1) {
    return {
      status: 'one',
      trainer: matches[0],
      matches,
      reason: `Тренер: ${matches[0].name}`,
    }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      matches,
      reason: `Несколько тренеров похожи на «${hint}» — выберите вручную`,
    }
  }
  return { status: 'none', matches: [], reason: `Тренер «${hint}» не найден в клубе — выберите из списка` }
}

/**
 * Найти тип абона по подписи из текста (Elite, VIP…).
 * @param {object[]} membershipTypes
 * @param {string} label
 * @returns {{ status: 'none'|'one'|'conflict', type?: object, matches: object[], reason: string }}
 */
export function matchMembershipTypeByLabelHint(membershipTypes, label) {
  const raw = String(label ?? '').trim()
  if (!raw) {
    return { status: 'none', matches: [], reason: 'В тексте нет типа карты' }
  }
  const hit = matchMembershipTypeByExcelLabel(raw, membershipTypes ?? [])
  if (hit?.id) {
    const row = (membershipTypes ?? []).find((t) => String(t?.id) === String(hit.id))
    if (row) {
      return {
        status: 'one',
        type: row,
        matches: [row],
        reason: `Тип: ${row.code || row.name || hit.code}`,
      }
    }
  }
  const key = raw.toLowerCase().replace(/\s+/g, ' ')
  const matches = (membershipTypes ?? []).filter((t) => {
    const code = String(t?.code ?? '')
      .trim()
      .toLowerCase()
    const name = String(t?.name ?? '')
      .trim()
      .toLowerCase()
    if (!code && !name) return false
    return code === key || name === key || code.includes(key) || key.includes(code) || name.includes(key)
  })
  if (matches.length === 1) {
    return {
      status: 'one',
      type: matches[0],
      matches,
      reason: `Тип: ${matches[0].code || matches[0].name}`,
    }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      matches,
      reason: `Несколько типов похожи на «${raw}» — выберите вручную`,
    }
  }
  return { status: 'none', matches: [], reason: `Тип «${raw}» не найден в справочнике — выберите вручную` }
}

/**
 * Собрать патч полей формы + подсказки после вставки текста.
 * @param {string} raw
 * @param {{ trainers?: object[], membershipTypes?: object[] }} [ctx]
 */
export function buildSaleClipFormPatchFromPaste(raw, ctx = {}) {
  const parsed = parseSaleClipPasteText(raw)
  const trainerMatch = matchTrainerByNameHint(ctx.trainers ?? [], parsed.trainerHint)
  const typeMatch = matchMembershipTypeByLabelHint(ctx.membershipTypes ?? [], parsed.membershipTypeLabel)

  /** @type {Record<string, string>} */
  const patch = {}
  if (parsed.cardNumber) patch.card_number = parsed.cardNumber
  if (parsed.phone) patch.phone = parsed.phone
  if (parsed.name) patch.client_name = parsed.name
  if (parsed.totalTrainings != null) patch.total_trainings = String(parsed.totalTrainings)
  if (parsed.startDate) patch.start_date = parsed.startDate
  if (parsed.endDate) patch.end_date = parsed.endDate
  if (parsed.membershipTypeLabel) patch.membership_type_label = parsed.membershipTypeLabel
  if (trainerMatch.status === 'one' && trainerMatch.trainer?.id) {
    patch.trainer_id = String(trainerMatch.trainer.id)
  }
  if (typeMatch.status === 'one' && typeMatch.type?.id) {
    patch.membership_type_id = String(typeMatch.type.id)
    patch.membership_type_label = String(typeMatch.type.code ?? typeMatch.type.name ?? parsed.membershipTypeLabel)
  }

  const extraWarnings = [...parsed.warnings]
  if (parsed.trainerHint && trainerMatch.status !== 'one') extraWarnings.push(trainerMatch.reason)
  if (parsed.membershipTypeLabel && typeMatch.status !== 'one') extraWarnings.push(typeMatch.reason)

  return {
    parsed,
    patch,
    trainerMatch,
    typeMatch,
    reason: parsed.reason,
    warnings: extraWarnings,
  }
}
