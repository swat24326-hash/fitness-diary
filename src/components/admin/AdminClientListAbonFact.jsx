/**
 * Факт «Абонемент» в строке списка: код типа (Dm…) + статус.
 */
/**
 * @param {{
 *   typeCode?: string,
 *   children: import('react').ReactNode,
 * }} props
 */
export function AdminClientListAbonFact({ typeCode = '', children }) {
  const code = String(typeCode ?? '').trim()
  return (
    <div className="td-client-fact">
      <span className="td-client-fact__label">Абонемент</span>
      <span className="td-client-fact__value td-client-fact__value--abon">
        {code ? (
          <span className="td-client-abon-type" title={`Тип карты: ${code}`}>
            {code}
          </span>
        ) : null}
        <span className="td-client-abon-status">{children}</span>
      </span>
    </div>
  )
}
