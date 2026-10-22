import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { HOMEWORK_EQUIPMENT } from '../../lib/homework/library/homeworkLibraryTags.js'
import { HOMEWORK_LIBRARY, filterHomeworkLibrary } from '../../lib/homework/library/homeworkLibrary.js'

const PLACEHOLDER = {
  warmup: 'Найти в разминку',
  main: 'Найти в основную часть',
  cooldown: 'Найти в заминку',
}

const EMPTY = {
  warmup: 'В разминке такого нет',
  main: 'В основной части такого нет',
  cooldown: 'В заминке такого нет',
}

/**
 * Кнопка под частью занятия: поиск по библиотеке и добавление в эту же часть.
 * @param {{ phase: 'warmup' | 'main' | 'cooldown', taken?: { library_id?: string, name?: string }[], onAdd: (entry: object) => void }} props
 */
export function HomeworkAddExercise({ phase, taken = [], onAdd }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (needle.length < 2) return []
    const have = new Set(taken.flatMap((ex) => [ex.library_id, ex.name].filter(Boolean)))
    return filterHomeworkLibrary(HOMEWORK_LIBRARY, {
      phase,
      allowImpact: phase === 'main',
      equipment: Object.keys(HOMEWORK_EQUIPMENT),
      maxLevel: 3,
    })
      .filter((e) => !have.has(e.id) && !have.has(e.name))
      .filter((e) => e.name.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [needle, phase, taken])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  if (!open) {
    return (
      <button type="button" className="homework-add__open btn-touch" onClick={() => setOpen(true)}>
        <span>Добавить</span>
        <span className="homework-add__mark" aria-hidden>
          <Plus size={18} />
        </span>
      </button>
    )
  }

  return (
    <div className="homework-add">
      <div className="homework-add__search">
        <input
          className="input"
          value={query}
          autoFocus
          placeholder={PLACEHOLDER[phase] ?? 'Найти упражнение'}
          aria-label={PLACEHOLDER[phase] ?? 'Найти упражнение'}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="homework-add__mark homework-add__mark--btn" aria-label="Закрыть поиск" title="Закрыть" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {needle.length >= 2 && !matches.length ? <p className="homework-add__hint">{EMPTY[phase]}</p> : null}
      {matches.length ? (
        <ul className="homework-add__list">
          {matches.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="homework-add__opt btn-touch"
                onClick={() => {
                  onAdd(entry)
                  close()
                }}
              >
                <span>{entry.name}</span>
                <span className="homework-add__mark" aria-hidden>
                  <Plus size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
