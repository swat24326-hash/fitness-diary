import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import {
  defaultOutreachTemplates,
  OUTREACH_PLACEHOLDER_HINTS,
  OUTREACH_SCENARIO_LABELS,
  OUTREACH_SCENARIOS,
} from '../../lib/trainer/trainerClientOutreachCore.js'
import { fetchIskraSettings, saveIskraSettings } from '../../lib/admin/iskraSettingsService.js'

/**
 * @param {{ clubId: string, clubName?: string, disabled?: boolean }} props
 */
export function AdminOutreachTemplatesSection({ clubId, clubName = 'клуб', disabled = false }) {
  const [templates, setTemplates] = useState(() => defaultOutreachTemplates())
  const [savedTemplates, setSavedTemplates] = useState(() => defaultOutreachTemplates())
  const [custom, setCustom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const data = await fetchIskraSettings(clubId)
      const t = { ...defaultOutreachTemplates(), ...(data?.outreach_templates ?? {}) }
      setTemplates(t)
      setSavedTemplates(t)
      setCustom(data?.outreach_templates_custom === true)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить шаблоны')
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  const dirty = JSON.stringify(templates) !== JSON.stringify(savedTemplates)

  const onSave = async () => {
    if (!clubId) return
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveIskraSettings(clubId, { outreachTemplates: templates })
      const t = { ...defaultOutreachTemplates(), ...(data?.outreach_templates ?? templates) }
      setTemplates(t)
      setSavedTemplates(t)
      setCustom(data?.outreach_templates_custom === true)
      setMsg('Шаблоны сохранены')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    const d = defaultOutreachTemplates()
    setTemplates(d)
    setMsg('Сброшено к стандартным — нажмите «Сохранить»')
  }

  return (
    <section className="card admin-outreach-templates__section">
      <h2 className="section-title">Сообщения тренеров в Max</h2>
      <p className="muted admin-outreach-templates__intro">
        Тексты для кнопки «Max» в списке клиентов тренера. Название клуба подставляется из карточки клуба (
        <strong>{clubName}</strong>).
      </p>
      <p className="muted admin-outreach-templates__placeholders">
        Плейсхолдеры: {OUTREACH_PLACEHOLDER_HINTS.map((p) => `${p.key} — ${p.label}`).join('; ')}
      </p>
      {loading ? <p className="muted">Загрузка…</p> : null}
      {err ? <p className="admin-outreach-templates__error" role="alert">{err}</p> : null}
      {msg ? <p className="admin-outreach-templates__ok">{msg}</p> : null}
      {!loading && OUTREACH_SCENARIOS.map((key) => (
        <div key={key} className="admin-outreach-templates__field">
          <label className="label" htmlFor={`outreach-${key}`}>
            {OUTREACH_SCENARIO_LABELS[key]}
          </label>
          <textarea
            id={`outreach-${key}`}
            className="input"
            value={templates[key] ?? ''}
            disabled={disabled || saving || !clubId}
            onChange={(e) => setTemplates((t) => ({ ...t, [key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="row admin-outreach-templates__actions">
        <button type="button" className="btn btn-primary" disabled={!clubId || disabled || saving || !dirty} onClick={() => void onSave()}>
          <Save size={16} aria-hidden />
          Сохранить шаблоны
        </button>
        <button type="button" className="btn btn-secondary" disabled={!clubId || disabled || saving} onClick={onReset}>
          <RotateCcw size={16} aria-hidden />
          Стандартные тексты
        </button>
      </div>
      {custom ? <p className="muted admin-outreach-templates__custom-hint">На клубе свои шаблоны (отличаются от стандартных).</p> : null}
    </section>
  )
}
