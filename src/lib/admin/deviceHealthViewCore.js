/**
 * Раскладка центра сбоев для админа (проверка: scripts/verify-device-health.mjs).
 * «Требуют внимания» — критичные сверху, затем кто дольше в сбое; «Все устройства» — по тренеру.
 */
import { DEVICE_HEALTH_CODES } from '../deviceHealth/deviceHealthCatalog.js'

function sinceMs(d) {
  const t = Date.parse(d.problem_since ?? '')
  return Number.isFinite(t) ? t : Infinity
}

export function splitDeviceHealth(devices) {
  const list = Array.isArray(devices) ? devices : []
  const attention = list
    .filter((d) => d.needs_attention)
    .sort((a, b) => Number(b.critical) - Number(a.critical) || sinceMs(a) - sinceMs(b))
  const all = [...list].sort(
    (a, b) => String(a.trainer_name ?? '').localeCompare(String(b.trainer_name ?? ''), 'ru') || String(a.label ?? '').localeCompare(String(b.label ?? ''), 'ru'),
  )
  return { attention, all }
}

/** Ключ «один и тот же отказ»: те же коды и тот же текст очереди. Без текста не склеиваем. */
function refusalKey(device) {
  const lines = (Array.isArray(device?.queue_lines) ? device.queue_lines : [])
    .map((line) => String(line?.text ?? '').trim())
    .filter(Boolean)
    .sort()
  if (!lines.length) return ''
  const codes = [...(device.codes ?? [])].map((code) => String(code)).sort()
  return `${codes.join(',')}\n${lines.join('\n')}`
}

/**
 * «Требуют внимания» → группы. Одинаковый отказ — одна группа, порядок групп как у первой карточки.
 * @returns {object[][]}
 */
export function groupDeviceAttention(attention) {
  const groups = []
  const at = new Map()
  for (const device of attention ?? []) {
    const key = refusalKey(device)
    if (!key) {
      groups.push([device])
      continue
    }
    const index = at.get(key)
    if (index == null) {
      at.set(key, groups.length)
      groups.push([device])
    } else {
      groups[index].push(device)
    }
  }
  return groups
}

export function deviceCodeTitle(code) {
  return DEVICE_HEALTH_CODES[code]?.title ?? code
}

/** Ссылка «Написать тренеру»: личный чат с готовым текстом в поле. */
export function deviceHealthMessageHref(device) {
  const text = `Здравствуйте! На вашем планшете сбой: ${device.codes.map(deviceCodeTitle).join('; ').toLowerCase()}.\n${device.instruction}`
  return `/messages?dm=${encodeURIComponent(device.user_id)}&text=${encodeURIComponent(text)}`
}
