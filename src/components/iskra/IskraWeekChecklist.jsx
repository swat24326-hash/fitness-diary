import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildWeekChecklistItems,
  readWeekChecklistState,
  weekChecklistStorageKey,
  writeWeekChecklistState,
} from '../../lib/admin/iskraWeekChecklistCore.js'

/**
 * @param {{
 *   snapshot: object | null,
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   items?: Array<object>,
 *   disabled?: boolean,
 *   onRunItem?: (item: object) => void,
 *   onAssignItem?: (item: object) => void,
 * }} props
 */
export function IskraWeekChecklist({ snapshot, clubId, year, month, items: itemsProp, disabled = false, onRunItem, onAssignItem }) {
  const storageKey = useMemo(
    () => (clubId ? weekChecklistStorageKey(clubId, year, month) : ''),
    [clubId, year, month],
  )
  const items = useMemo(
    () => itemsProp ?? buildWeekChecklistItems(snapshot, { limit: 3 }),
    [itemsProp, snapshot],
  )
  const [checked, setChecked] = useState(() => (storageKey ? readWeekChecklistState(storageKey) : {}))

  useEffect(() => {
    if (!storageKey) return
    setChecked(readWeekChecklistState(storageKey))
  }, [storageKey, items])

  const toggle = useCallback(
    (id) => {
      if (!storageKey) return
      setChecked((prev) => {
        const next = { ...prev, [id]: !prev[id] }
        writeWeekChecklistState(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  if (!items.length) return null

  const doneCount = items.filter((it) => checked[it.id]).length

  return (
    <section className="iskra-week-checklist" aria-label="Чеклист недели">
      <div className="iskra-week-checklist__head">
        <h3 className="iskra-week-checklist__title">Чеклист недели</h3>
        <span className="muted iskra-week-checklist__meta">
          {doneCount}/{items.length}
        </span>
      </div>
      <ul className="iskra-week-checklist__list">
        {items.map((item) => (
          <li key={item.id} className={checked[item.id] ? 'iskra-week-checklist__item iskra-week-checklist__item--done' : 'iskra-week-checklist__item'}>
            <label className="iskra-week-checklist__label">
              <input
                type="checkbox"
                checked={checked[item.id] === true}
                disabled={disabled}
                onChange={() => toggle(item.id)}
              />
              <span>{item.label}</span>
            </label>
            {onRunItem ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled}
                onClick={() => onRunItem(item)}
              >
                Спросить
              </button>
            ) : null}
            {onAssignItem ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled}
                onClick={() => onAssignItem(item)}
              >
                Назначить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
