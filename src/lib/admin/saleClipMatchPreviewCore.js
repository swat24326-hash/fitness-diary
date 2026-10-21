/**
 * Строка совпадения клипа с карточкой — до кнопки.
 * Если ФИО разъехались, отдаёт две карточки рядом: кто в базе и кто в клипе.
 * Без React / IDB.
 */

import { formatClientName } from '../clientNameFormat.js'
import { normalizeSalesCardNumber } from './salesClientMatchCore.js'

/**
 * @param {unknown} raw
 * @returns {string}
 */
function comparableName(raw) {
  return formatClientName(raw).replace(/ё/gi, 'е').toLowerCase()
}

/**
 * ФИО карточки и клипа разные. Пустое имя с любой стороны — не «разъезд».
 * @param {unknown} cardName
 * @param {unknown} clipName
 * @returns {boolean}
 */
export function saleClipNamesMismatch(cardName, clipName) {
  const card = comparableName(cardName)
  const clip = comparableName(clipName)
  if (!card || !clip) return false
  return card !== clip
}

/**
 * У карточки уже есть другой тренер. Нового клиента и пустого trainer_id не спрашиваем.
 * @param {object|null|undefined} client
 * @param {unknown} selectedTrainerId
 * @returns {boolean}
 */
export function saleClipNeedsTransferConfirm(client, selectedTrainerId) {
  if (!client) return false
  const current = String(client.trainer_id ?? '').trim()
  const selected = String(selectedTrainerId ?? '').trim()
  if (!current || !selected) return false
  return current.toLowerCase() !== selected.toLowerCase()
}

/**
 * @param {{ title: string, name: string, cardNumber: string, phone: string, trainerName: string }} face
 */
function previewFace(face) {
  return {
    title: face.title,
    name: face.name || '—',
    cardNumber: String(face.cardNumber ?? '').trim(),
    phone: String(face.phone ?? '').trim(),
    trainerName: String(face.trainerName ?? '').trim(),
  }
}

/**
 * @param {{
 *   client?: object|null,
 *   clipName?: unknown,
 *   cardNumber?: unknown,
 *   clipPhone?: unknown,
 *   selectedTrainerId?: unknown,
 *   selectedTrainerName?: unknown,
 *   clientTrainerName?: unknown,
 * }} [input]
 * @returns {{
 *   line: string,
 *   namesMismatch: boolean,
 *   needTransferConfirm: boolean,
 *   cards: null | {
 *     onFile: { title: string, name: string, cardNumber: string, phone: string, trainerName: string },
 *     inClip: { title: string, name: string, cardNumber: string, phone: string, trainerName: string },
 *   },
 * }}
 */
export function buildSaleClipMatchPreview(input = {}) {
  const client = input.client ?? null
  const clipName = formatClientName(input.clipName)
  const card = normalizeSalesCardNumber(input.cardNumber)
  const clipPhone = String(input.clipPhone ?? '').trim()
  const needTransferConfirm = saleClipNeedsTransferConfirm(client, input.selectedTrainerId)

  if (!client) {
    return {
      line: 'Клиент не найден — заведём карточку',
      namesMismatch: false,
      needTransferConfirm: false,
      cards: null,
    }
  }

  const cardName = formatClientName(client.name ?? client.client_name)
  const namesMismatch = saleClipNamesMismatch(cardName, clipName)
  const line =
    card && namesMismatch && cardName && clipName
      ? `Карта ${card} — это ${cardName}, в клипе ${clipName}`
      : card && cardName
        ? `Карта ${card} — это ${cardName}`
        : namesMismatch && cardName && clipName
          ? `Это ${cardName}, в клипе ${clipName}`
          : cardName
            ? `Нашли карточку: ${cardName}`
            : 'Клиент найден'

  const fileCard = normalizeSalesCardNumber(client.card_number) || card
  const cards = namesMismatch
    ? {
        onFile: previewFace({
          title: 'В карточке',
          name: cardName,
          cardNumber: fileCard,
          phone: client.phone,
          trainerName: input.clientTrainerName,
        }),
        inClip: previewFace({
          title: 'В клипе',
          name: clipName,
          cardNumber: card,
          phone: clipPhone,
          trainerName: input.selectedTrainerName,
        }),
      }
    : null

  return { line, namesMismatch, needTransferConfirm, cards }
}
