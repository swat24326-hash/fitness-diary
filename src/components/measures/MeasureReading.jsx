import { bodyMeasureLines, formatMeasureCm, getMeasureValue } from '../../lib/bodyMeasures'

/**
 * Один замер: все параметры. Пары — правая/левая или верх/низ в одной строке.
 * @param {{ row: object }} props
 */
export function MeasureReading({ row }) {
  return (
    <div className="measure-reading">
      {bodyMeasureLines().map((line) => {
        const pair = line.cells.length > 1
        return (
          <div key={line.id} className={pair ? 'measure-reading__line measure-reading__line--pair' : 'measure-reading__line'}>
            <span className="measure-reading__name">{line.label}</span>
            {line.cells.map((cell) => {
              const text = formatMeasureCm(getMeasureValue(row, cell.id))
              return (
                <span key={cell.id} className="measure-reading__cell">
                  {cell.side ? <span className="measure-reading__side">{cell.side}</span> : null}
                  <span className={text == null ? 'measure-reading__value is-empty' : 'measure-reading__value'}>{text ?? '—'}</span>
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
