import { useCallback, useEffect, useMemo, useState } from 'react'
import { EyeOff, Pencil, Plus, RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useHomeworkLibrary } from '../../hooks/useHomeworkLibrary.js'
import { pullHomeworkLibrary, saveHomeworkLibraryEntry } from '../../lib/homework/library/homeworkLibraryService.js'
import {
  baseHomeworkEntry,
  homeworkLibraryAdminList,
  newHomeworkLibraryId,
} from '../../lib/homework/library/homeworkLibraryOverridesCore.js'
import { emptyHomeworkLibraryForm, homeworkLibraryFormFromEntry } from '../../lib/homework/library/homeworkLibraryFormCore.js'
import { homeworkEntryPhases } from '../../lib/homework/library/homeworkLibrary.js'
import {
  HOMEWORK_AVOID,
  HOMEWORK_EQUIPMENT,
  HOMEWORK_LEVELS,
  HOMEWORK_PATTERNS,
  HOMEWORK_PHASES,
} from '../../lib/homework/library/homeworkLibraryTags.js'
import { HomeworkLibraryEntryForm } from './HomeworkLibraryEntryForm.jsx'

const STATUS = { base: '', edited: 'Изменено', custom: 'Своё', removed: 'Убрано' }
const FILTERS = [
  ['all', 'Все в подборе'],
  ['changed', 'Изменённые и свои'],
  ['removed', 'Убранные'],
]

/** Справочник → «Библиотека ДЗ»: из неё авто-ДЗ подбирает упражнения во всех клубах. Меняет только админ. */
export function AdminHomeworkLibrary() {
  const { user } = useAuth()
  const { rows, library } = useHomeworkLibrary()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [pattern, setPattern] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      await pullHomeworkLibrary()
      setMsg('')
    } catch (e) {
      setMsg(`Не удалось обновить с сервера: ${e?.message ?? e}. Показана сохранённая на устройстве версия.`)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const all = useMemo(() => homeworkLibraryAdminList(rows), [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(({ entry, status }) => {
      if (filter === 'removed' ? status !== 'removed' : status === 'removed') return false
      if (filter === 'changed' && status === 'base') return false
      if (pattern && entry.pattern !== pattern) return false
      return !needle || String(entry.name).toLowerCase().includes(needle)
    })
  }, [all, q, filter, pattern])

  const save = async (entry, isActive, done) => {
    setBusy(true)
    try {
      await saveHomeworkLibraryEntry({ entry, isActive, userId: user?.id })
      setMsg(done)
      setEditing(null)
    } catch (e) {
      setMsg(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const removedCount = all.filter((x) => x.status === 'removed').length

  return (
    <section className="card hwlib">
      <div className="td-section-head">
        <h2 className="section-title td-section-title hwlib__title">
          Библиотека ДЗ <span className="muted hwlib__count">{all.length - removedCount} в подборе</span>
        </h2>
        <div className="row td-actions hwlib__actions">
          <button
            type="button"
            className="btn btn-primary btn-touch row"
            disabled={busy}
            onClick={() => setEditing({ form: emptyHomeworkLibraryForm(newHomeworkLibraryId()), isNew: true })}
          >
            <Plus size={18} aria-hidden />
            Добавить упражнение
          </button>
          <button type="button" className="btn btn-ghost btn-icon-square btn-touch" title="Обновить" aria-label="Обновить" disabled={busy} onClick={refresh}>
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
        </div>
      </div>
      <p className="muted hwlib__hint">
        Отсюда авто-ДЗ подбирает упражнения для клиентов всех клубов. Правки попадут в следующие задания; уже отправленные не меняются. Убранное упражнение можно вернуть.
      </p>
      {msg ? <p className="hwlib__msg" role="status">{msg}</p> : null}

      <div className="hwlib__filters">
        <input className="input hwlib__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" aria-label="Поиск по названию" />
        <select className="select" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Движение">
          <option value="">Все движения</option>
          {Object.entries(HOMEWORK_PATTERNS).map(([id, text]) => (
            <option key={id} value={id}>{text}</option>
          ))}
        </select>
        <div className="hwlib-chips" role="group" aria-label="Показать">
          {FILTERS.map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              className={`homework-group-chip${filter === id ? ' homework-group-chip--active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {id === 'removed' ? `${text} · ${removedCount}` : text}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="hwlib__table">
          <thead>
            <tr>
              <th>Упражнение</th>
              <th>Движение</th>
              <th>Уровень</th>
              <th>Инвентарь</th>
              <th>Часть занятия</th>
              <th>Нельзя при</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ entry, status }) => (
              <tr key={entry.id} className={status === 'removed' ? 'hwlib__row--removed' : undefined}>
                <td>
                  <span className="hwlib__name">{entry.name}</span>
                  {STATUS[status] ? <span className={`hwlib__status hwlib__status--${status}`}>{STATUS[status]}</span> : null}
                </td>
                <td>{HOMEWORK_PATTERNS[entry.pattern]}</td>
                <td>{HOMEWORK_LEVELS[entry.level]}</td>
                <td>{HOMEWORK_EQUIPMENT[entry.equip]}</td>
                <td>{homeworkEntryPhases(entry).map((p) => HOMEWORK_PHASES[p]).join(', ')}</td>
                <td>{entry.avoid.map((a) => HOMEWORK_AVOID[a]).join(', ') || '—'}</td>
                <td>
                  <div className="row hwlib__row-actions">
                    {status === 'removed' ? (
                      <button type="button" className="btn btn-ghost btn-touch row" disabled={busy} onClick={() => save(entry, true, `«${entry.name}» снова в подборе`)}>
                        <RotateCcw size={16} aria-hidden />
                        Вернуть
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch"
                          title="Изменить"
                          aria-label={`Изменить «${entry.name}»`}
                          disabled={busy}
                          onClick={() => setEditing({ form: homeworkLibraryFormFromEntry(entry), isNew: false })}
                        >
                          <Pencil size={18} aria-hidden />
                        </button>
                        {status === 'edited' ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon-square btn-touch"
                            title="Вернуть как было"
                            aria-label={`Вернуть «${entry.name}» как было`}
                            disabled={busy}
                            onClick={() => save(baseHomeworkEntry(entry.id), true, `«${entry.name}» — как было изначально`)}
                          >
                            <Undo2 size={18} aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch"
                          title="Убрать из подбора"
                          aria-label={`Убрать «${entry.name}» из подбора`}
                          disabled={busy}
                          onClick={() => save(entry, false, `«${entry.name}» убрано из подбора — вернуть можно в «Убранные»`)}
                        >
                          <EyeOff size={18} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <p className="muted hwlib__empty">Ничего не нашлось</p> : null}
      </div>

      {editing ? (
        <HomeworkLibraryEntryForm
          initial={editing.form}
          isNew={editing.isNew}
          library={library}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(entry) => save(entry, true, `«${entry.name}» сохранено`)}
        />
      ) : null}
    </section>
  )
}
