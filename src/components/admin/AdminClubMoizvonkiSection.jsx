import { useCallback, useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { fetchIskraSettings, saveIskraSettings } from '../../lib/admin/iskraSettingsService.js'

/**
 * Учётные данные «Мои Звонки» для выбранного клуба (телефон клуба для SMS).
 * @param {{ clubId: string, clubName?: string, disabled?: boolean }} props
 */
export function AdminClubMoizvonkiSection({ clubId, clubName = 'клуб', disabled = false }) {
  const [userEmail, setUserEmail] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [status, setStatus] = useState(/** @type {object | null} */ (null))
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
      const club = data?.moizvonki_club ?? {}
      setUserEmail(String(club.user_email ?? ''))
      setApiBase(String(club.api_base ?? ''))
      setHasKey(Boolean(club.has_api_key))
      setApiKey('')
      setStatus(data?.moizvonki ?? null)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить Мои Звонки')
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  const onSave = async () => {
    if (!clubId || disabled) return
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      /** @type {Record<string, string>} */
      const moizvonki = {
        user_email: userEmail.trim(),
        api_base: apiBase.trim(),
      }
      if (apiKey.trim()) moizvonki.api_key = apiKey.trim()
      const data = await saveIskraSettings(clubId, { moizvonki })
      const club = data?.moizvonki_club ?? {}
      setUserEmail(String(club.user_email ?? ''))
      setApiBase(String(club.api_base ?? ''))
      setHasKey(Boolean(club.has_api_key))
      setApiKey('')
      setStatus(data?.moizvonki ?? null)
      setMsg('Мои Звонки клуба сохранены')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const onClear = async () => {
    if (!clubId || disabled) return
    if (!window.confirm('Убрать клубные Мои Звонки? Останется только общий env на сервере (если задан).')) {
      return
    }
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveIskraSettings(clubId, { clearMoizvonki: true })
      setUserEmail('')
      setApiBase('')
      setHasKey(false)
      setApiKey('')
      setStatus(data?.moizvonki ?? null)
      setMsg('Клубные Мои Звонки сброшены')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сброса')
    } finally {
      setSaving(false)
    }
  }

  const sourceLabel =
    status?.source === 'club'
      ? 'Этот клуб'
      : status?.source === 'env'
        ? 'Общий env сервера'
        : status?.source === 'merge'
          ? 'Клуб + env'
          : 'Не настроено'

  return (
    <section className="card admin-outreach-templates__section">
      <h2 className="section-title">Мои Звонки · {clubName}</h2>
      <p className="muted admin-outreach-templates__intro">
        Свой Android / аккаунт для SMS этого клуба. Если поля пустые — используется общий{' '}
        <code>MOIZVONKI_*</code> на сервере (один телефон на всю сеть). Ключ в браузер не показываем.
      </p>
      {loading ? <p className="muted">Загрузка…</p> : null}
      {err ? <p className="admin-outreach-templates__error" role="alert">{err}</p> : null}
      {msg ? <p className="admin-outreach-templates__ok">{msg}</p> : null}
      {!loading ? (
        <>
          <p className="muted" role="status">
            Сейчас SMS идут через: <strong>{sourceLabel}</strong>
            {status?.configured ? '' : ' — отправка недоступна'}
            {status?.user_email_masked ? ` · ${status.user_email_masked}` : ''}
          </p>
          <div className="admin-outreach-templates__field">
            <label htmlFor="mz-email">Email пользователя Мои Звонки</label>
            <input
              id="mz-email"
              type="email"
              className="input"
              value={userEmail}
              disabled={disabled || saving}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="club@example.com"
              autoComplete="off"
            />
          </div>
          <div className="admin-outreach-templates__field">
            <label htmlFor="mz-base">Домен или URL API</label>
            <input
              id="mz-base"
              type="text"
              className="input"
              value={apiBase}
              disabled={disabled || saving}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="fitcity или https://fitcity.moizvonki.ru/api/v1"
              autoComplete="off"
            />
          </div>
          <div className="admin-outreach-templates__field">
            <label htmlFor="mz-key">API-ключ {hasKey ? '(сохранён — введите новый, чтобы заменить)' : ''}</label>
            <input
              id="mz-key"
              type="password"
              className="input"
              value={apiKey}
              disabled={disabled || saving}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? '••••••••' : 'Ключ из кабинета Мои Звонки'}
              autoComplete="new-password"
            />
          </div>
          <div className="row admin-outreach-templates__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || saving}
              onClick={() => void onSave()}
            >
              <Save size={16} aria-hidden /> Сохранить
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={disabled || saving || (!hasKey && !userEmail && !apiBase)}
              onClick={() => void onClear()}
            >
              <Trash2 size={16} aria-hidden /> Сбросить клуб
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
