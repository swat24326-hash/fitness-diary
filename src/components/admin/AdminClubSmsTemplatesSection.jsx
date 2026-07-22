import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import {
  OUTREACH_SCENARIO_LABELS,
  OUTREACH_SCENARIOS,
} from '../../lib/trainer/trainerClientOutreachCore.js'
import {
  CLUB_SMS_PLACEHOLDER_HINTS,
  defaultClubSmsTemplates,
} from '../../lib/admin/clubSmsTemplatesCore.js'
import { fetchIskraSettings, saveIskraSettings } from '../../lib/admin/iskraSettingsService.js'

/**
 * Шаблоны SMS от клуба (Мои Звонки) — отдельно от Max-сообщений тренера.
 * @param {{ clubId: string, clubName?: string, disabled?: boolean }} props
 */
export function AdminClubSmsTemplatesSection({ clubId, clubName = 'клуб', disabled = false }) {
  const [templates, setTemplates] = useState(() => defaultClubSmsTemplates())
  const [savedTemplates, setSavedTemplates] = useState(() => defaultClubSmsTemplates())
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
      const t = { ...defaultClubSmsTemplates(), ...(data?.club_sms_templates ?? {}) }
      setTemplates(t)
      setSavedTemplates(t)
      setCustom(data?.club_sms_templates_custom === true)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить шаблоны SMS')
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
      const data = await saveIskraSettings(clubId, { clubSmsTemplates: templates })
      const t = { ...defaultClubSmsTemplates(), ...(data?.club_sms_templates ?? templates) }
      setTemplates(t)
      setSavedTemplates(t)
      setCustom(data?.club_sms_templates_custom === true)
      setMsg('Шаблоны SMS клуба сохранены')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    setTemplates(defaultClubSmsTemplates())
    setMsg('Сброшено к стандартным SMS клуба — нажмите «Сохранить»')
  }

  return (
    <section className="card admin-outreach-templates__section">
      <h2 className="section-title">SMS от клуба (Мои Звонки)</h2>
      <p className="muted admin-outreach-templates__intro">
        Тексты для кнопки SMS в списке клиентов админа. Уходят с телефона клуба — пишите от имени{' '}
        <strong>{clubName}</strong>, не «это твой тренер».
      </p>
      <p className="muted admin-outreach-templates__placeholders">
        Плейсхолдеры: {CLUB_SMS_PLACEHOLDER_HINTS.map((p) => `${p.key} — ${p.label}`).join('; ')}
      </p>
      {loading ? <p className="muted">Загрузка…</p> : null}
      {err ? <p className="admin-outreach-templates__error" role="alert">{err}</p> : null}
      {msg ? <p className="admin-outreach-templates__ok">{msg}</p> : null}
      {!loading &&
        OUTREACH_SCENARIOS.map((key) => (
          <div key={key} className="admin-outreach-templates__field">
            <label className="label" htmlFor={`club-sms-${key}`}>
              {OUTREACH_SCENARIO_LABELS[key]}
            </label>
            <textarea
              id={`club-sms-${key}`}
              className="input"
              value={templates[key] ?? ''}
              disabled={disabled || saving || !clubId}
              onChange={(e) => setTemplates((t) => ({ ...t, [key]: e.target.value }))}
            />
          </div>
        ))}
      <div className="row admin-outreach-templates__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!clubId || disabled || saving || !dirty}
          onClick={() => void onSave()}
        >
          <Save size={16} aria-hidden />
          Сохранить SMS клуба
        </button>
        <button type="button" className="btn btn-secondary" disabled={!clubId || disabled || saving} onClick={onReset}>
          <RotateCcw size={16} aria-hidden />
          Стандартные тексты
        </button>
      </div>
      {custom ? (
        <p className="muted admin-outreach-templates__custom-hint">На клубе свои SMS-шаблоны (отличаются от стандартных).</p>
      ) : null}
    </section>
  )
}
