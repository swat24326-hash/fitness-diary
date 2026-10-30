import { useState } from 'react'
import { ChevronDown, Ruler } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import { formatCmDeltaPartsRu, formatCmPartsRu, measurementDeltas } from '../../lib/client/clientMeUiCore.js'

function CmNum({ n }) {
  const { int, frac } = formatCmPartsRu(n)
  return (
    <span className="client-me-deltas__num">
      <span className="client-me-deltas__int">{int}</span>
      <span className="client-me-deltas__frac">{frac}</span>
    </span>
  )
}

function CmDelta({ n }) {
  const { sign, int, frac } = formatCmDeltaPartsRu(n)
  return (
    <em className="client-me-muted client-me-deltas__delta">
      <span className="client-me-deltas__int">
        {sign}
        {int}
      </span>
      <span className="client-me-deltas__frac">{frac}</span>
      <span> см</span>
    </em>
  )
}

/**
 * Обмеры на /me: как вес — сравнение первого и последнего замера.
 * Свои (source=client) — кнопка «Изменить».
 * @param {{
 *   measurements?: { date?: string, values?: object, source?: string, id?: string, editable?: boolean }[]
 *   onEditSelf?: (row: object) => void
 * }} props
 */
export function ClientMeasuresFold({ measurements, onEditSelf }) {
  const list = Array.isArray(measurements) ? measurements : []
  const deltas = measurementDeltas(list)
  const [open, setOpen] = useState(false)
  const selfRows = list.filter((m) => m?.source === 'client' && m?.id && onEditSelf)
  if (!deltas.length && !selfRows.length) return null

  const fromDate = formatDateRu(list[0]?.date)
  const toDate = formatDateRu(list.at(-1)?.date)

  return (
    <div className="client-me-measures">
      {deltas.length ? (
        <button
          type="button"
          className="client-me-measures__btn btn-touch"
          aria-expanded={open}
          aria-label={fromDate && toDate ? `Обмеры с ${fromDate} по ${toDate}` : 'Обмеры'}
          onClick={() => setOpen((v) => !v)}
        >
          <Ruler size={18} aria-hidden />
          <span className="client-me-measures__label">Обмеры</span>
          <ChevronDown size={18} className={`client-me-measures__chev${open ? ' is-open' : ''}`} aria-hidden />
        </button>
      ) : null}
      {fromDate && toDate && deltas.length ? (
        <div className="client-me-measures__axis" aria-hidden>
          <span>{fromDate}</span>
          <span>{toDate}</span>
        </div>
      ) : null}
      {open && deltas.length ? (
        <ul className="client-me-deltas">
          {deltas.map((d) => (
            <li key={d.id}>
              <span className="client-me-deltas__label">{d.label}</span>
              <CmNum n={d.from} />
              <span className="client-me-deltas__dash client-me-muted" aria-hidden>
                —
              </span>
              <CmNum n={d.to} />
              <CmDelta n={d.diff} />
            </li>
          ))}
        </ul>
      ) : null}
      {selfRows.length ? (
        <ul className="client-me-measures__self">
          {selfRows.map((m) => (
            <li key={m.id}>
              <button type="button" className="btn-secondary btn-touch" onClick={() => onEditSelf?.(m)}>
                Изменить обмеры · {formatDateRu(m.date)} · вы внесли
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
