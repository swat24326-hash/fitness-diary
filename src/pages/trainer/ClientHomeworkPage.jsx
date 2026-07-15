import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { listExercises, resolveClubDisplayName } from '../../lib/dataAccess'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { listHomeworkPresetsForClub } from '../../lib/homework/homeworkPresetsService'
import { filterHomeworkExerciseCatalog, listHomeworkMuscleGroups } from '../../lib/homework/homeworkCatalogFilter.js'
import {
  addExerciseToHomeworkDraft,
  applyHomeworkPresetToDraft,
  countHomeworkExercises,
  emptyHomeworkDraft,
  patchHomeworkDraftExercise,
  removeExerciseFromHomeworkDraft,
  setHomeworkDraftComment,
} from '../../lib/homework/homeworkPlanCore.js'
import { sendHomeworkDraft } from '../../lib/homework/homeworkShareCore.js'
import { HomeworkPlanDisplay } from '../../components/trainer/HomeworkPlanDisplay.jsx'

const MODES = {
  presets: 'presets',
  builder: 'builder',
}

export function ClientHomeworkPage({ client, readOnly = false }) {
  const { user } = useAuth()
  const clubId = String(client?.club_id ?? '').trim()

  const [mode, setMode] = useState(MODES.presets)
  const [presets, setPresets] = useState([])
  const [catalog, setCatalog] = useState([])
  const [draft, setDraft] = useState(() => emptyHomeworkDraft())
  const [filterGroup, setFilterGroup] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [clubName, setClubName] = useState('')

  const reloadPresets = useCallback(async () => {
    if (!clubId) {
      setPresets([])
      return
    }
    setPresets(await listHomeworkPresetsForClub(clubId, { activeOnly: true }))
  }, [clubId])

  useEffect(() => {
    void reloadPresets()
  }, [reloadPresets])

  useEffect(() => {
    void listExercises().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!clubId) {
        setClubName('')
        return
      }
      try {
        const name = await resolveClubDisplayName(clubId)
        if (!cancelled) {
          const n = String(name ?? '').trim()
          setClubName(!n || n === '—' || n === clubId ? '' : n)
        }
      } catch {
        if (!cancelled) setClubName('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId])

  useEffect(() => {
    const onStorage = (e) => {
      if (e?.detail?.reason === 'homework-presets') void reloadPresets()
    }
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [reloadPresets])

  const groups = useMemo(() => listHomeworkMuscleGroups(catalog), [catalog])
  const filtered = useMemo(
    () => filterHomeworkExerciseCatalog(catalog, search, filterGroup).slice(0, 60),
    [catalog, search, filterGroup],
  )

  const clientName = formatClientName(client?.name) || String(client?.name ?? '').trim()
  const trainerName = String(user?.name ?? '').trim()
  const draftCount = countHomeworkExercises(draft)

  const pickPreset = (preset) => {
    const next = applyHomeworkPresetToDraft(preset)
    if (next) {
      setDraft(next)
      setStatusMsg('Шаблон выбран — при необходимости поправьте нормы и жмите «В Max»')
      // после выбора — сразу к превью (конструктор не мешает)
      setMode(MODES.presets)
    }
  }

  const addFromCatalog = (row) => {
    if (readOnly) return
    setDraft((d) =>
      addExerciseToHomeworkDraft(
        d?.mode === 'builder' || countHomeworkExercises(d) > 0
          ? d
          : { ...emptyHomeworkDraft(), title: d?.title || 'Домашнее задание', comment: d?.comment || '' },
        {
          catalog_exercise_id: row.id,
          name: String(row.name ?? '').trim(),
          sets: 2,
          reps: '10',
          rest_sec: 30,
        },
        row.muscle_group || 'Основное',
      ),
    )
    setStatusMsg('')
  }

  const onClear = () => {
    setDraft(emptyHomeworkDraft())
    setStatusMsg('')
    setMode(MODES.presets)
  }

  const onSend = async (channel = 'max') => {
    if (readOnly) return
    setBusy(true)
    setStatusMsg('')
    try {
      const res = await sendHomeworkDraft(
        draft,
        {
          client,
          clientName,
          trainerName,
          clubName,
        },
        { channel },
      )
      if (!res.ok) {
        if (res.error === 'empty_draft') setStatusMsg('Добавьте упражнения')
        else setStatusMsg(res.detail || 'Не удалось сформировать PNG')
        return
      }
      const parts = []
      if (channel === 'other') {
        if (res.shared) parts.push('выберите мессенджер в меню «Поделиться»')
        else if (res.downloaded) parts.push('PNG скачан — прикрепите в мессенджер')
      } else {
        if (res.shared) parts.push('карточка готова к отправке')
        else if (res.downloaded) parts.push('PNG скачан — прикрепите в Max')
        if (res.opened) {
          parts.push(res.openMode === 'direct_chat' ? 'открыт чат Max' : 'открыто окно Max')
        }
      }
      setStatusMsg(parts.join(' · ') || 'Готово')
    } finally {
      setBusy(false)
    }
  }

  if (!client) return null

  return (
    <div className="homework-page">
      <header className="homework-hero card">
        <div>
          <p className="homework-hero__eyebrow">Домашнее задание</p>
          <h2 className="homework-hero__title">{clientName || 'Клиент'}</h2>
          <p className="muted homework-hero__sub">Шаблон или конструктор → карточка → Max или другой мессенджер.</p>
        </div>
        {draftCount > 0 ? <span className="homework-hero__badge">{draftCount} упр.</span> : null}
      </header>

      {!readOnly ? (
        <div className="homework-main-tabs" role="tablist" aria-label="Режим ДЗ">
          <button
            type="button"
            role="tab"
            className={`homework-main-tabs__item${mode === MODES.presets ? ' homework-main-tabs__item--active' : ''}`}
            aria-selected={mode === MODES.presets}
            onClick={() => setMode(MODES.presets)}
          >
            Шаблоны
          </button>
          <button
            type="button"
            role="tab"
            className={`homework-main-tabs__item${mode === MODES.builder ? ' homework-main-tabs__item--active' : ''}`}
            aria-selected={mode === MODES.builder}
            onClick={() => setMode(MODES.builder)}
          >
            <Plus size={16} aria-hidden />
            Собрать сам
          </button>
        </div>
      ) : null}

      {!readOnly && mode === MODES.presets ? (
        <section className="card homework-presets" aria-label="Шаблоны ДЗ">
          {!presets.length ? (
            <p className="muted">
              Нет шаблонов. Админ: Structure → ДЗ (создадутся автоматически), затем Sync.
            </p>
          ) : (
            <div className="homework-presets__grid">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`homework-preset-card${draft.presetId === p.id ? ' homework-preset-card--active' : ''}`}
                  onClick={() => pickPreset(p)}
                >
                  <span className="homework-preset-card__dir">{p.direction || 'ДЗ'}</span>
                  <span className="homework-preset-card__title">{p.title}</span>
                  {p.description ? <span className="homework-preset-card__desc">{p.description}</span> : null}
                  <span className="homework-preset-card__cta">Выбрать</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!readOnly && mode === MODES.builder ? (
        <section className="card homework-builder" aria-label="Конструктор ДЗ">
          <div className="homework-builder__filters">
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти упражнение"
              aria-label="Поиск упражнения"
            />
          </div>
          {groups.length > 0 ? (
            <div className="homework-group-chips" role="listbox" aria-label="Группы мышц">
              <button
                type="button"
                className={`homework-group-chip${!filterGroup ? ' homework-group-chip--active' : ''}`}
                onClick={() => setFilterGroup('')}
              >
                Все
              </button>
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`homework-group-chip${filterGroup === g ? ' homework-group-chip--active' : ''}`}
                  onClick={() => setFilterGroup(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          ) : null}
          <div className="homework-builder__list">
            {!filtered.length ? (
              <p className="muted">Нет совпадений в справочнике.</p>
            ) : (
              filtered.map((row) => (
                <button key={row.id} type="button" className="homework-builder__opt" onClick={() => addFromCatalog(row)}>
                  <span className="homework-builder__opt-main">
                    <span>{row.name}</span>
                    <span className="muted">{row.muscle_group}</span>
                  </span>
                  <span className="homework-builder__opt-add" aria-hidden>
                    +
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      <HomeworkPlanDisplay
        draft={draft}
        readOnly={readOnly}
        busy={busy}
        statusMsg={statusMsg}
        onCommentChange={(v) => setDraft((d) => setHomeworkDraftComment(d, v))}
        onPatchExercise={(bIdx, exIdx, patch) => setDraft((d) => patchHomeworkDraftExercise(d, bIdx, exIdx, patch))}
        onRemoveExercise={(bIdx, exIdx) => setDraft((d) => removeExerciseFromHomeworkDraft(d, bIdx, exIdx))}
        onClear={onClear}
        onSendMax={() => onSend('max')}
        onSendOther={() => onSend('other')}
      />
    </div>
  )
}
