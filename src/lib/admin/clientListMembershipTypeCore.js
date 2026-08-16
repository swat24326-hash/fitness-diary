/**
 * Код типа абонемента (Dm, El…) для строки списка клиентов.
 * Без импорта membershipTypesService — чтобы verify не тянул supabase/IDB.
 *
 * Критично: код должен быть от того же абона, что на экране в «Абонемент».
 * Нельзя подставлять тип будущего/старого абона, если в строке уже выбран active/expiredLeft.
 */

/**
 * @param {Map<string, object>|object[]|null|undefined} typesOrMap
 * @param {string|null|undefined} typeId
 * @returns {string}
 */
function typeCodeOf(typesOrMap, typeId) {
  const id = String(typeId ?? '').trim()
  if (!id) return ''
  if (typesOrMap instanceof Map) {
    return String(typesOrMap.get(id)?.code ?? '').trim()
  }
  const hit = (Array.isArray(typesOrMap) ? typesOrMap : []).find((t) => String(t?.id) === id)
  return String(hit?.code ?? '').trim()
}

/**
 * Какой абон брать для кода типа в списке.
 * @param {{
 *   active?: object | null,
 *   expiredLeft?: object | null,
 *   memList?: object[],
 *   todayIso?: string,
 * }} opts
 * @returns {object | null}
 */
export function pickMembershipForTypeCodeDisplay(opts = {}) {
  // Строка уже показывает этот абон — не прыгаем на другой ради кода.
  if (opts.active) return opts.active
  if (opts.expiredLeft) return opts.expiredLeft

  const list = Array.isArray(opts.memList) ? opts.memList : []
  const d = String(opts.todayIso ?? '').slice(0, 10)

  if (d) {
    const future = list
      .filter((m) => m?.start_date && String(m.start_date).slice(0, 10) > d)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
    if (future) return future
  }

  const withDates = list.filter((m) => m?.end_date || m?.start_date)
  if (!withDates.length) return null
  return withDates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/**
 * @param {{
 *   active?: object | null,
 *   expiredLeft?: object | null,
 *   memList?: object[],
 *   todayIso?: string,
 * }} opts
 * @param {Map<string, object>|object[]} typesOrMap
 * @returns {string}
 */
export function resolveClientListMembershipTypeCode(opts, typesOrMap) {
  const row = pickMembershipForTypeCodeDisplay(opts)
  return typeCodeOf(typesOrMap, row?.membership_type_id)
}
