import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { pullHomeworkPresetsForClubFromCloud } from '../../lib/pullReferenceData'
import { listExercises } from '../../lib/dataAccess'
import {
  deactivateHomeworkPreset,
  insertHomeworkPreset,
  listHomeworkPresetsForClub,
  seedDefaultHomeworkPresetsForClub,
  updateHomeworkPreset,
} from '../../lib/homework/homeworkPresetsService'
import { filterHomeworkExerciseCatalog, listHomeworkMuscleGroups } from '../../lib/homework/homeworkCatalogFilter.js'
import { normalizeHomeworkItems } from '../../lib/homework/homeworkPresetsCore.js'

function emptyEditor() {
  return {
    id: null,
    title: '',
    direction: '',
    description: '',
    blocks: [{ label: 'Основное', exercises: [] }],
  }
}

function presetToEditor(p) {
  const items = normalizeHomeworkItems(p.items)
  return {
    id: p.id,
    title: p.title ?? '',
    direction: p.direction ?? '',
    description: p.description ?? '',
    blocks: items.blocks.length ? items.blocks : [{ label: 'Основное', exercises: [] }],
  }
}

export function AdminHomeworkPresets() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''

  const [items, setItems] = useState([])
  const [catalog, setCatalog] = useState([])
  const [editor, setEditor] = useState(emptyEditor)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [seedDone, setSeedDone] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [filterGroup, setFilterGroup] = useState('')
  const [search, setSearch] = useState('')
  const [targetBlockIdx, setTargetBlockIdx] = useState(0)

  const reloadLocal = useCallback(async () => {
    if (!clubId) {
      setItems([])
      return
    }
    setItems(await listHomeworkPresetsForClub(clubId, { activeOnly: false }))
  }, [clubId])

  useEffect(() => {
    void listExercises().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  /** При первом открытии вкладки — 5 шаблонов в БД клуба. */
  useEffect(() => {
    if (!clubId || seedDone) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        if (isSupabaseConfigured() && navigator.onLine) {
          await pullHomeworkPresetsForClubFromCloud(clubId, { forceFromCloud: true })
        }
        const r = await seedDefaultHomeworkPresetsForClub(clubId)
        if (cancelled) return
        if (r.seeded && r.count > 0) setMsg(`Созданы базовые шаблоны ДЗ: ${r.count}`)
        await reloadLocal()
      } finally {
        if (!cancelled) {
          setSeedDone(true)
          setBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, seedDone, reloadLocal])

  useEffect(() => {
    setSeedDone(false)
    setEditor(emptyEditor())
    setMsg('')
  }, [clubId])

  const groups = useMemo(() => listHomeworkMuscleGroups(catalog), [catalog])
  const filteredCatalog = useMemo(
    () => filterHomeworkExerciseCatalog(catalog, search, filterGroup).slice(0, 80),
    [catalog, search, filterGroup],
  )
  const activeCount = useMemo(() => items.filter((p) => p.is_active !== false).length, [items])

  const pullFromCloud = async () => {
    if (!clubId) return
    setPullBusy(true)
    setMsg('')
    try {
      const r = await pullHomeworkPresetsForClubFromCloud(clubId, { forceFromCloud: true })
      if (!r.ok) setMsg(r.error ?? 'Ошибка загрузки')
      else setMsg(`Загружено из облака: ${r.count ?? 0}`)
      await reloadLocal()
    } finally {
      setPullBusy(false)
    }
  }

  const startNew = () => {
    setEditor(emptyEditor())
    setConfirmId(null)
  }

  const openPreset = (p) => {
    setEditor(presetToEditor(p))
    setConfirmId(null)
  }

  const patchBlockLabel = (idx, label) => {
    setEditor((ed) => {
      const blocks = ed.blocks.map((b, i) => (i === idx ? { ...b, label } : b))
      return { ...ed, blocks }
    })
  }

  const addBlock = () => {
    setEditor((ed) => ({
      ...ed,
      blocks: [...ed.blocks, { label: `Блок ${ed.blocks.length + 1}`, exercises: [] }],
    }))
  }

  const addExerciseToBlock = (blockIdx, row) => {
    setEditor((ed) => {
      const blocks = ed.blocks.map((b, i) => {
        if (i !== blockIdx) return b
        if (b.exercises.some((ex) => ex.catalog_exercise_id === row.id)) return b
        return {
          ...b,
          exercises: [
            ...b.exercises,
            {
              catalog_exercise_id: row.id,
              name: String(row.name ?? '').trim(),
              sets: 2,
              reps: '10',
              rest_sec: 30,
            },
          ],
        }
      })
      return { ...ed, blocks }
    })
  }

  const patchExercise = (blockIdx, exIdx, patch) => {
    setEditor((ed) => {
      const blocks = ed.blocks.map((b, i) => {
        if (i !== blockIdx) return b
        const exercises = b.exercises.map((ex, j) => (j === exIdx ? { ...ex, ...patch } : ex))
        return { ...b, exercises }
      })
      return { ...ed, blocks }
    })
  }

  const removeExercise = (blockIdx, exIdx) => {
    setEditor((ed) => {
      const blocks = ed.blocks
        .map((b, i) => {
          if (i !== blockIdx) return b
          return { ...b, exercises: b.exercises.filter((_, j) => j !== exIdx) }
        })
        .filter((b) => b.exercises.length > 0 || ed.blocks.length === 1)
      return { ...ed, blocks: blocks.length ? blocks : [{ label: 'Основное', exercises: [] }] }
    })
  }

  const saveEditor = async () => {
    if (!clubId) return
    const title = editor.title.trim()
    if (!title) {
      setMsg('Укажите название шаблона')
      return
    }
    const payloadItems = normalizeHomeworkItems({ blocks: editor.blocks })
    if (!payloadItems.blocks.length) {
      setMsg('Добавьте хотя бы одно упражнение из справочника')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      if (editor.id) {
        const res = await updateHomeworkPreset(editor.id, {
          title,
          direction: editor.direction.trim(),
          description: editor.description.trim() || null,
          items: payloadItems,
        })
        if (!res.cloudOk && res.cloudError) setMsg(res.cloudError)
        else setMsg('Шаблон сохранён')
      } else {
        const res = await insertHomeworkPreset({
          club_id: clubId,
          title,
          direction: editor.direction.trim(),
          description: editor.description.trim() || null,
          items: payloadItems,
          sort_order: items.length,
        })
        if (!res.cloudOk && res.cloudError) setMsg(res.cloudError)
        else {
          setMsg('Шаблон создан')
          setEditor(emptyEditor())
        }
      }
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }

  const onDeactivate = async (id) => {
    setBusy(true)
    setMsg('')
    try {
      const res = await deactivateHomeworkPreset(id)
      if (!res.cloudOk && res.cloudError) setMsg(res.cloudError)
      else {
        setMsg('Шаблон отключён')
        if (editor.id === id) setEditor(emptyEditor())
      }
      setConfirmId(null)
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <section className="card admin-homework-page">
        <p className="muted">Выберите клуб в шапке — у каждого клуба свои шаблоны домашних заданий.</p>
      </section>
    )
  }

  return (
    <div className="admin-homework-page">
      <section className="card admin-homework-hero">
        <div className="admin-homework-hero__text">
          <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            Шаблоны ДЗ
          </h2>
          <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
            Быстрый старт для тренера на планшете. Упражнения — только из справочника клуба. При первом открытии
            создаются 5 базовых шаблонов — их можно править.
          </p>
          <p className="admin-homework-hero__stat">
            Активных: <strong>{activeCount}</strong>
          </p>
        </div>
        <div className="admin-homework-hero__actions">
          <button type="button" className="btn btn-touch" disabled={busy} onClick={startNew}>
            <Plus size={18} aria-hidden />
            Новый
          </button>
          {isSupabaseConfigured() ? (
            <button type="button" className="btn btn-touch btn-ghost" disabled={pullBusy || busy} onClick={() => void pullFromCloud()}>
              <RefreshCw size={18} aria-hidden className={pullBusy ? 'spin' : undefined} />
              Из облака
            </button>
          ) : null}
        </div>
      </section>

      {msg ? <p className="admin-homework-msg muted">{msg}</p> : null}

      <div className="admin-homework-layout">
        <section className="card admin-homework-list">
          <h3 className="admin-homework-list__title">Шаблоны клуба</h3>
          {!items.length ? (
            <p className="muted">Пока нет шаблонов.</p>
          ) : (
            <ul className="admin-homework-list__ul">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`admin-homework-list__item${editor.id === p.id ? ' admin-homework-list__item--active' : ''}${p.is_active === false ? ' admin-homework-list__item--off' : ''}`}
                    onClick={() => openPreset(p)}
                  >
                    <span className="admin-homework-list__item-title">{p.title}</span>
                    <span className="muted">{p.direction || 'Без направления'}</span>
                  </button>
                  {p.is_active !== false ? (
                    confirmId === p.id ? (
                      <div className="admin-homework-list__confirm">
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void onDeactivate(p.id)}>
                          Отключить
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-icon-square btn-touch"
                        aria-label={`Отключить ${p.title}`}
                        onClick={() => setConfirmId(p.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card admin-homework-editor">
          <h3 className="admin-homework-list__title">{editor.id ? 'Редактирование' : 'Новый шаблон'}</h3>
          <div className="admin-homework-form-grid">
            <label className="admin-homework-field">
              <span>Название</span>
              <input
                className="input"
                value={editor.title}
                onChange={(e) => setEditor((ed) => ({ ...ed, title: e.target.value }))}
                placeholder="Спина без боли"
              />
            </label>
            <label className="admin-homework-field">
              <span>Направление</span>
              <input
                className="input"
                value={editor.direction}
                onChange={(e) => setEditor((ed) => ({ ...ed, direction: e.target.value }))}
                placeholder="Мобилити / поясница"
              />
            </label>
            <label className="admin-homework-field admin-homework-field--wide">
              <span>Описание</span>
              <textarea
                className="input"
                rows={2}
                value={editor.description}
                onChange={(e) => setEditor((ed) => ({ ...ed, description: e.target.value }))}
                placeholder="Коротко для тренера"
              />
            </label>
          </div>

          {editor.blocks.map((block, bIdx) => (
            <div
              key={`block-${bIdx}`}
              className={`admin-homework-block${targetBlockIdx === bIdx ? ' admin-homework-block--target' : ''}`}
            >
              <div className="admin-homework-block__head">
                <label className="admin-homework-field">
                  <span>Блок</span>
                  <input className="input" value={block.label} onChange={(e) => patchBlockLabel(bIdx, e.target.value)} />
                </label>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTargetBlockIdx(bIdx)}>
                  {targetBlockIdx === bIdx ? 'Сюда добавляем' : 'Выбрать'}
                </button>
              </div>
              <ul className="admin-homework-ex-list">
                {block.exercises.map((ex, exIdx) => (
                  <li key={`${ex.catalog_exercise_id}-${exIdx}`} className="admin-homework-ex-row">
                    <span className="admin-homework-ex-row__name">{ex.name}</span>
                    <input
                      className="input input-sm"
                      type="number"
                      min={1}
                      max={20}
                      value={ex.sets}
                      aria-label="Подходы"
                      onChange={(e) => patchExercise(bIdx, exIdx, { sets: Number(e.target.value) || 1 })}
                    />
                    <input
                      className="input input-sm"
                      value={ex.reps}
                      aria-label="Повторы"
                      onChange={(e) => patchExercise(bIdx, exIdx, { reps: e.target.value })}
                    />
                    <input
                      className="input input-sm"
                      type="number"
                      min={0}
                      max={600}
                      value={ex.rest_sec}
                      aria-label="Отдых, сек"
                      onChange={(e) => patchExercise(bIdx, exIdx, { rest_sec: Number(e.target.value) || 0 })}
                    />
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeExercise(bIdx, exIdx)}>
                      Убрать
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <button type="button" className="btn btn-ghost btn-touch" onClick={addBlock}>
            + Блок
          </button>

          <div className="admin-homework-catalog">
            <h4 className="admin-homework-catalog__title">
              Справочник — в блок «{editor.blocks[targetBlockIdx]?.label ?? 'Основное'}»
            </h4>
            <div className="admin-homework-catalog__filters">
              <select className="input" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} aria-label="Группа мышц">
                <option value="">Все группы</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск упражнения"
              />
            </div>
            <div className="admin-homework-catalog__list" role="listbox">
              {filteredCatalog.length === 0 ? (
                <p className="muted">Нет упражнений — заполните справочник во вкладке «Упражнения».</p>
              ) : (
                filteredCatalog.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="admin-homework-catalog__opt"
                    onClick={() => addExerciseToBlock(targetBlockIdx, row)}
                  >
                    <span>{row.name}</span>
                    <span className="muted">{row.muscle_group}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="admin-homework-editor__actions">
            <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void saveEditor()}>
              <Save size={18} aria-hidden />
              Сохранить
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
