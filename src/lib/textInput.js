/** Невидимые маркеры направления текста — ломают порядок ввода/отображение (часто из Word, PDF, мессенджеров). */
const BIDI_CTRL = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

export function stripDirectionControls(s) {
  return String(s ?? '').replace(BIDI_CTRL, '')
}
