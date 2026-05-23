import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, RefreshCw, X } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { listExercises, pullExercisesFromSupabase } from '../../lib/dataAccess'
import { insertExercise, updateExercise, removeExercise } from '../../lib/exerciseService'

export function AdminExercises() {
  const [exercises, setExercises] = useState([])
  const [q, setQ] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [exForm, setExForm] = useState({ name: '', muscle_group: '', primary_muscles: '', comment: '' })
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  /** { id, name } — подтверждение удаления */
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadLocal = useCallback(async () => {
    setExercises(await listExercises())
  }, [])

  /** Кнопка «Обновить» — pull с сервера (force). */
  const refreshFromCloud = useCallback(async () => {
    setMsg('')
    setBusy(true)
    try {
      if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        const r = await pullExercisesFromSupabase({ force: true })
        if (!r.ok && r.error) setMsg(r.error)
        else if (r.skipped) setMsg('Кэш уже совпадает с облаком.')
      }
      await loadLocal()
    } finally {
      setBusy(false)
    }
  }, [loadLocal])

  useEffect(() => {
    void loadLocal()
  }, [loadLocal])

  const groups = useMemo(() => {
    const s = new Set()
    for (const ex of exercises) {
      if (ex.muscle_group) s.add(ex.muscle_group)
    }
    return [...s].sort()
  }, [exercises])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return exercises.filter((ex) => {
      if (filterGroup && (ex.muscle_group ?? '') !== filterGroup) return false
      if (!qq) return true
      const hay = `${ex.name ?? ''} ${ex.muscle_group ?? ''} ${ex.primary_muscles ?? ''} ${ex.comment ?? ''}`.toLowerCase()
      return hay.includes(qq)
    })
  }, [exercises, q, filterGroup])

  const addExercise = async (e) => {
    e.preventDefault()
    setMsg('')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = {
      id,
      name: exForm.name.trim(),
      muscle_group: exForm.muscle_group.trim(),
      primary_muscles: exForm.primary_muscles.trim() || null,
      comment: exForm.comment.trim() || null,
      created_at: now,
    }
    try {
      const cloud = await insertExercise(row)
      if (!cloud.cloudOk) {
        setMsg(`Сохранено локально, в облако не ушло: ${cloud.cloudError}. Нажмите Sync в шапке.`)
      } else if (cloud.merged) {
        setMsg('В облаке уже было упражнение с таким названием — подставлена запись с сервера.')
      }
      setExForm({ name: '', muscle_group: '', primary_muscles: '', comment: '' })
      await loadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения')
    }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editId) return
    setMsg('')
    const row = {
      id: editId,
      name: exForm.name.trim(),
      muscle_group: exForm.muscle_group.trim(),
      primary_muscles: exForm.primary_muscles.trim() || null,
      comment: exForm.comment.trim() || null,
      created_at: exercises.find((x) => x.id === editId)?.created_at ?? new Date().toISOString(),
    }
    try {
      const cloud = await updateExercise(row)
      if (!cloud.cloudOk) {
        setMsg(`Изменения локально, в облако не ушли: ${cloud.cloudError}. Нажмите Sync.`)
      }
      setEditId(null)
      setExForm({ name: '', muscle_group: '', primary_muscles: '', comment: '' })
      await loadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка сохранения')
    }
  }

  const startEdit = (ex) => {
    setEditId(ex.id)
    setExForm({
      name: ex.name ?? '',
      muscle_group: ex.muscle_group ?? '',
      primary_muscles: ex.primary_muscles ?? '',
      comment: ex.comment ?? '',
    })
  }

  const runDeleteExercise = async () => {
    if (!confirmDelete) return
    setDeleteBusy(true)
    setMsg('')
    try {
      const cloud = await removeExercise(confirmDelete.id)
      if (!cloud.cloudOk) {
        setMsg(cloud.cloudError ?? 'Не удалось удалить в облаке')
        return
      }
      setConfirmDelete(null)
      await loadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка удаления')
    } finally {
      setDeleteBusy(false)
    }
  }

  const bulkLoad = async () => {
    setMsg('')
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) {
      setMsg('Введите строки в формате: Название,Направленность,Основные мышцы,Примечание')
      return
    }
    const now = new Date().toISOString()
    let failed = 0
    try {
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim())
        const [name, muscle_group, primary_muscles, comment] = [parts[0], parts[1], parts[2], parts[3]]
        if (!name || !muscle_group) continue
        const row = {
          id: crypto.randomUUID(),
          name,
          muscle_group,
          primary_muscles: primary_muscles || null,
          comment: comment || null,
          created_at: now,
        }
        const cloud = await insertExercise(row)
        if (!cloud.cloudOk) failed += 1
      }
      setBulkText('')
      if (failed > 0) {
        setMsg(`${failed} строк не ушли в облако — проверьте сеть и Sync, или дубликаты названий.`)
      }
      await loadLocal()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка быстрой загрузки')
    }
  }

  return (
    <div className="grid stagger td-grid">
      <section className="card">
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Упражнения
          </h2>
          <div className="row td-actions">
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch"
              disabled={busy}
              onClick={() => void refreshFromCloud()}
              aria-label="Обновить список"
              title="Обновить"
            >
              <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {msg && <p className="muted">{msg}</p>}
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Список из кэша (быстро). «Обновить» — подтянуть с Supabase. Новые записи сразу уходят в облако; на другом устройстве — Sync в шапке.
        </p>

        <h3 className="section-title td-period__title" style={{ margin: '16px 0 8px' }}>
          Добавить одно
        </h3>
        <form onSubmit={editId ? saveEdit : addExercise} className="grid" style={{ gap: 8, marginBottom: 16 }}>
          <input className="input" placeholder="Название" value={exForm.name} onChange={(e) => setExForm((f) => ({ ...f, name: e.target.value }))} required />
          <input
            className="input"
            placeholder="Направленность (muscle_group)"
            value={exForm.muscle_group}
            onChange={(e) => setExForm((f) => ({ ...f, muscle_group: e.target.value }))}
            required
          />
          <input
            className="input"
            placeholder="Основные мышцы"
            value={exForm.primary_muscles}
            onChange={(e) => setExForm((f) => ({ ...f, primary_muscles: e.target.value }))}
          />
          <input className="input" placeholder="Примечание" value={exForm.comment} onChange={(e) => setExForm((f) => ({ ...f, comment: e.target.value }))} />
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-touch">
              {editId ? 'Сохранить изменения' : 'Добавить упражнение'}
            </button>
            {editId && (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => {
                  setEditId(null)
                  setExForm({ name: '', muscle_group: '', primary_muscles: '', comment: '' })
                }}
              >
                Отмена
              </button>
            )}
          </div>
        </form>

        <h3 className="section-title td-period__title" style={{ margin: '16px 0 8px' }}>
          Быстрая загрузка
        </h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Каждая строка: <code>Название,Направленность,Основные мышцы,Примечание</code>
        </p>
        <textarea className="input" rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        <button type="button" className="btn btn-primary btn-touch" style={{ marginTop: 8 }} onClick={bulkLoad}>
          Загрузить строки
        </button>

        <h3 className="section-title td-period__title" style={{ margin: '22px 0 10px' }}>
          Список
        </h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label className="label">Поиск</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, мышцы…" />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label className="label">Направленность</label>
            <select className="select" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">Все</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Направленность</th>
                <th>Основные мышцы</th>
                <th>Примечание</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.name}</td>
                  <td>{ex.muscle_group ?? '—'}</td>
                  <td>{ex.primary_muscles ?? '—'}</td>
                  <td>{ex.comment ?? '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-square btn-touch"
                        aria-label="Редактировать упражнение"
                        title="Редактировать"
                        onClick={() => startEdit(ex)}
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-square btn-touch"
                        aria-label="Удалить упражнение"
                        title="Удалить"
                        onClick={() => setConfirmDelete({ id: ex.id, name: ex.name })}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirmDelete && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-ex-title"
          onClick={() => !deleteBusy && setConfirmDelete(null)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-ex-title" className="section-title" style={{ marginTop: 0 }}>
              Удалить упражнение?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Упражнение <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong> будет удалено из справочника. В уже сохранённых тренировках ссылки в данных могут остаться.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={deleteBusy} onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-touch"
                style={{ background: 'rgba(248,113,113,0.2)', borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
                disabled={deleteBusy}
                onClick={() => void runDeleteExercise()}
              >
                {deleteBusy ? 'Удаление…' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
