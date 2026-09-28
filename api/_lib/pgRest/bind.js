const CASTABLE = new Set([
  'uuid',
  'date',
  'timestamp',
  'timestamptz',
  'bool',
  'int2',
  'int4',
  'int8',
  'numeric',
  'float4',
  'float8',
  'json',
  'jsonb',
])

/**
 * Кладёт значение в массив параметров и возвращает плейсхолдер.
 * Имя типа — только из белого списка (приходит из information_schema).
 * @param {unknown[]} values
 * @param {unknown} value
 * @param {string | null | undefined} udt
 */
export function pushPlaceholder(values, value, udt) {
  const json = udt === 'json' || udt === 'jsonb'
  if (json && value !== null && value !== undefined) {
    values.push(typeof value === 'string' ? value : JSON.stringify(value))
  } else {
    values.push(value === undefined ? null : value)
  }
  const cast = value != null && CASTABLE.has(udt) ? `::${udt}` : ''
  return `$${values.length}${cast}`
}
