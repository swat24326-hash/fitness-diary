/** Единый лаконичный формат мгновенных ответов ИСКРЫ. */

import { ISKRA_NAME } from './geminiIskraCore.js'

/** Рекомендуемый потолок слов для чата и TTS. */
export const ISKRA_REPLY_MAX_WORDS = 50

export function iskraReplyClose() {
  return 'На связи.'
}

/** @param {string} club @param {string} period */
export function iskraReplyHeader(club, period) {
  const c = String(club ?? '').trim() || 'клуб'
  const p = String(period ?? '').trim() || 'месяц'
  return `${ISKRA_NAME}, ${c}, ${p}.`
}

/** @param {string} name @param {string} period */
export function iskraTrainerHeader(name, period) {
  const n = String(name ?? '').trim() || 'тренер'
  const p = String(period ?? '').trim() || 'месяц'
  return `${ISKRA_NAME}, ${n}, ${p}.`
}

/**
 * @param {string} header
 * @param {string} body
 * @param {{ close?: boolean }} [opts]
 */
export function joinIskraReply(header, body, opts = {}) {
  const close = opts.close !== false
  const parts = [header, body]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
  let text = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return close ? iskraReplyClose() : ''
  text = text.replace(/\s*\.+\s*$/, '')
  if (close && !/на связи\.?$/i.test(text)) {
    text = `${text}. ${iskraReplyClose()}`
  } else if (!/[.!?]$/.test(text)) {
    text = `${text}.`
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** @param {string} text */
export function countIskraReplyWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
