import { Pencil } from 'lucide-react'
import { ModalHeader } from '../ModalHeader'
import { formatDateRu } from '../../lib/dateRu'
import { bodyMeasureLines, formatMeasureCm, getMeasureValue } from '../../lib/bodyMeasures'
import { MeasureReading } from './MeasureReading'

/**
 * История замеров: на широком окне — таблица для сравнения дат, на узком — карточки.
 * @param {{ measurements: object[], readOnly?: boolean, onClose: () => void, onEdit?: (row: object) => void }} props
 */
export function MeasureHistoryModal({ measurements, readOnly = false, onClose, onEdit }) {
  const canEdit = !readOnly && typeof onEdit === 'function'
  const lines = bodyMeasureLines()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel measure-history-panel measure-history-panel--body" onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="История замеров" onClose={onClose} />
        <div className="measure-history">
          <div className="measure-history__wide">
            <table className="measure-history-table measure-history-table--body">
              <colgroup>
                <col className="measure-history-table__date" />
                {lines.flatMap((line) => line.cells.map((cell) => <col key={cell.id} />))}
                {canEdit ? <col className="measure-history-table__act" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th className="measure-history-table__date" rowSpan={2} scope="col">
                    Дата
                  </th>
                  {lines.map((line) =>
                    line.cells.length === 1 ? (
                      <th key={line.id} rowSpan={2} scope="col">
                        {line.label}
                      </th>
                    ) : (
                      <th key={line.id} className="is-group-start" colSpan={line.cells.length} scope="colgroup">
                        {line.label}
                      </th>
                    ),
                  )}
                  {canEdit ? <th className="measure-history-table__act" rowSpan={2} scope="col" /> : null}
                </tr>
                <tr>
                  {lines.flatMap((line) =>
                    line.cells.length === 1
                      ? []
                      : line.cells.map((cell, index) => (
                          <th
                            key={cell.id}
                            className={index === 0 ? 'is-group-start measure-history-table__side' : 'measure-history-table__side'}
                            scope="col"
                          >
                            {cell.side}
                          </th>
                        )),
                  )}
                </tr>
              </thead>
              <tbody>
                {measurements.map((row) => (
                  <tr key={row.id}>
                    <th className="measure-history-table__date" scope="row">
                      {formatDateRu(row.date)}
                    </th>
                    {lines.flatMap((line) =>
                      line.cells.map((cell, index) => {
                        const text = formatMeasureCm(getMeasureValue(row, cell.id))
                        return (
                          <td key={cell.id} className={index === 0 && line.cells.length > 1 ? 'is-group-start' : undefined}>
                            <span className={text == null ? 'is-empty' : undefined}>{text ?? '—'}</span>
                          </td>
                        )
                      }),
                    )}
                    {canEdit ? (
                      <td className="measure-history-table__act">
                        <EditMeasureButton date={row.date} onClick={() => onEdit(row)} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="measure-history__narrow">
            {measurements.map((row) => (
              <article key={row.id} className="measure-history-card">
                <div className="measure-history-card__head">
                  <time className="measure-history-card__date" dateTime={String(row.date ?? '').slice(0, 10)}>
                    {formatDateRu(row.date)}
                  </time>
                  {canEdit ? <EditMeasureButton date={row.date} onClick={() => onEdit(row)} /> : null}
                </div>
                <MeasureReading row={row} />
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditMeasureButton({ date, onClick }) {
  const label = `Редактировать замер от ${formatDateRu(date)}`
  return (
    <button type="button" className="btn btn-ghost btn-icon-square measure-history__edit" aria-label={label} title="Редактировать" onClick={onClick}>
      <Pencil size={16} aria-hidden />
    </button>
  )
}
