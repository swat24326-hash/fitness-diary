import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { fetchIskraLearningBundle, saveIskraPlaybook } from '../../lib/admin/iskraLearningService.js'

/**
 * @param {{ clubId: string, disabled?: boolean }} props
 */
export function IskraPlaybooksSection({ clubId, disabled = false }) {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [signals, setSignals] = useState([])
  const [drafts, setDrafts] = useState(() => ({}))

  const reload = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      setSignals([])
      return
    }
    setLoading(true)
    setErr('')
    try {
      const data = await fetchIskraLearningBundle(clubId)
      const rows = Array.isArray(data?.signals) ? data.signals : []
      setSignals(rows)
      const next = {}
      for (const s of rows) {
        next[s.signal_key] = {
          note: String(s.playbook_note ?? '').trim(),
          confirmed: s.playbook_confirmed === true,
        }
      }
      setDrafts(next)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить уроки')
      setSignals([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  const onSave = async (signalKey) => {
    const draft = drafts[signalKey]
    if (!draft?.note?.trim()) {
      setErr('Введите текст урока')
      return
    }
    setSavingKey(signalKey)
    setErr('')
    setOkMsg('')
    try {
      await saveIskraPlaybook({
        clubId,
        signalKey,
        note: draft.note.trim(),
        confirmed: draft.confirmed === true,
      })
      setOkMsg('Урок сохранён — ИСКРА учтёт его в ответах.')
      await reload()
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setSavingKey('')
    }
  }

  const top = signals.slice(0, 8)

  return (
    <section className="card admin-iskra-settings__section">
      <h2 className="section-title">Уроки клуба (playbooks)</h2>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
        ИСКРА запоминает, что помогает вашему клубу. Подтверждённые уроки попадают в контекст ответов в режимах
        «Стандарт» и «Подробно».
      </p>

      {err ? (
        <p className="admin-iskra-settings__error" role="alert">
          {err}
        </p>
      ) : null}
      {okMsg ? <p className="admin-iskra-settings__ok">{okMsg}</p> : null}

      {loading ? (
        <p className="muted">Загрузка сигналов…</p>
      ) : !clubId ? (
        <p className="muted">Выберите клуб в шапке.</p>
      ) : top.length === 0 ? (
        <p className="muted">
          Пока нет сигналов. Оцените ответы ИСКРЫ 👍/👎 в панели — уроки появятся автоматически.
        </p>
      ) : (
        <ul className="admin-iskra-settings__playbooks">
          {top.map((s) => {
            const key = s.signal_key
            const draft = drafts[key] ?? { note: '', confirmed: false }
            return (
              <li key={key} className="admin-iskra-settings__playbook">
                <div className="admin-iskra-settings__playbook-head">
                  <strong>{key}</strong>
                  <span className="muted">
                    👍 {s.positive_count ?? 0} · score {Number(s.score ?? 0).toFixed(1)}
                  </span>
                </div>
                <textarea
                  className="admin-iskra-settings__textarea"
                  rows={3}
                  value={draft.note}
                  disabled={disabled || savingKey === key}
                  placeholder="Например: «Сначала план ПЗ, потом неактивные — так руководителю понятнее»"
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [key]: { ...draft, note: e.target.value },
                    }))
                  }
                />
                <div className="admin-iskra-settings__playbook-foot">
                  <label className="admin-iskra-settings__check">
                    <input
                      type="checkbox"
                      checked={draft.confirmed === true}
                      disabled={disabled || savingKey === key}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: { ...draft, confirmed: e.target.checked },
                        }))
                      }
                    />
                    Подтвердить урок для ИСКРЫ
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={disabled || savingKey === key || !draft.note.trim()}
                    onClick={() => void onSave(key)}
                  >
                    <Save size={14} aria-hidden />
                    Сохранить урок
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
