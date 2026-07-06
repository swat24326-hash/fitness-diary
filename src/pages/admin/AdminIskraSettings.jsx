import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, RotateCcw, Save, Sparkles } from 'lucide-react'
import { ISKRA_FULL_NAME } from '../../lib/admin/geminiIskraCore.js'
import { fetchIskraSettings, saveIskraSettings } from '../../lib/admin/iskraSettingsService.js'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { useAuth } from '../../context/AuthContext'

const SALES_MANAGER_HINTS = [
  'План продаж и уровни 1–3 (сосуд) — валовая выручка, возвраты не уменьшают план.',
  'Покрытие дневных отчётов — без отчётов выводы по месяцу предварительные.',
  'Структура НК / ДК / УК и доп. продаж — баланс притока новых клиентов.',
  'Направления ПЗ, ТЗ, АЗ — выполнение плана по залам в рублях.',
  'Возвраты — только чистая прибыль и заработок месяца, не план.',
  'ПНК, лучший день по прибыли, сравнение с прошлым месяцем.',
  'Чистая прибыль клуба после ЗП залов и расхода супервайзера.',
  'FIT-CITY vs отчёт менеджера — справка по планшетам, не весь зал.',
  'Тренерский контур — личная ЗП и неактивные клиенты (отдельно от продаж).',
]

export function AdminIskraSettings() {
  const { supabaseReady } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  const [clubName, setClubName] = useState('—')
  const [promptAppend, setPromptAppend] = useState('')
  const [defaultPreview, setDefaultPreview] = useState('')
  const [savedAppend, setSavedAppend] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    const loadClub = async () => {
      try {
        if (supabaseReady) await pullClubsFromSupabase()
        const clubs = await listClubsLocal()
        const hit = clubs.find((c) => String(c.id) === clubId)
        if (alive) setClubName(hit?.name ?? (clubId || '—'))
      } catch {
        if (alive) setClubName(clubId || '—')
      }
    }
    void loadClub()
    return () => {
      alive = false
    }
  }, [clubId, supabaseReady])

  const reloadSettings = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      setErr('Выберите клуб в шапке админки')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const data = await fetchIskraSettings(clubId)
      const append = String(data?.prompt_append ?? '')
      setPromptAppend(append)
      setSavedAppend(append)
      setDefaultPreview(String(data?.default_prompt_preview ?? ''))
      if (data?.club_name) setClubName(data.club_name)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  const onSave = async () => {
    if (!clubId) return
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      await saveIskraSettings(clubId, promptAppend)
      setSavedAppend(promptAppend)
      setMsg('Сохранено')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const onResetAppend = () => {
    setPromptAppend('')
    setMsg('Дополнение очищено — нажмите «Сохранить», чтобы применить на сервере')
  }

  const dirty = promptAppend !== savedAppend

  return (
    <div className="admin-iskra-settings">
      <header className="admin-iskra-settings__head">
        <Link to={`/admin${clubQs}`} className="admin-diagnostics__back btn btn-ghost btn-sm">
          <ChevronLeft size={16} aria-hidden />
          Админка
        </Link>
        <div className="admin-iskra-settings__title-row">
          <Sparkles size={22} aria-hidden />
          <div>
            <h1 className="admin-iskra-settings__title">{ISKRA_FULL_NAME}</h1>
            <p className="muted admin-iskra-settings__sub">
              {clubName !== '—' ? `Филиал «${clubName}»` : 'Выберите клуб в шапке'}
            </p>
          </div>
        </div>
      </header>

      {err ? (
        <p className="admin-iskra-settings__error" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? <p className="admin-iskra-settings__ok">{msg}</p> : null}

      <section className="card admin-iskra-settings__section">
        <h2 className="section-title">Дополнение к системному промпту</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          Базовые правила (два контура, запрет самостоятельных расчётов, persona ИСКРА) зашиты в приложение и одинаковы для
          всех клубов. Здесь — только клубное дополнение: акценты для руководителя, формулировки, приоритеты по продажам.
        </p>
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <label className="admin-iskra-settings__label" htmlFor="iskra-prompt-append">
              Дополнение (append)
            </label>
            <textarea
              id="iskra-prompt-append"
              className="admin-iskra-settings__textarea"
              rows={8}
              value={promptAppend}
              onChange={(e) => setPromptAppend(e.target.value)}
              placeholder="Например: «В первую очередь комментируй план ПЗ и покрытие отчётов. Не уходи в тренерский контур, пока не спросят.»"
              disabled={!clubId || saving}
            />
            <div className="row admin-iskra-settings__actions">
              <button type="button" className="btn btn-primary" disabled={!clubId || saving || !dirty} onClick={() => void onSave()}>
                <Save size={16} aria-hidden />
                Сохранить
              </button>
              <button type="button" className="btn btn-secondary" disabled={!clubId || saving} onClick={onResetAppend}>
                <RotateCcw size={16} aria-hidden />
                Очистить дополнение
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card admin-iskra-settings__section">
        <h2 className="section-title">Что нужно управленцу по продажам</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          ИСКРА уже умеет отвечать на эти темы через готовые поля отчёта менеджера — используйте кнопки в панели ✨ или
          спросите своими словами.
        </p>
        <ul className="admin-iskra-settings__hints">
          {SALES_MANAGER_HINTS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <details className="card admin-iskra-settings__section admin-iskra-settings__preview">
        <summary className="admin-iskra-settings__summary">Базовый промпт (только чтение)</summary>
        <pre className="admin-iskra-settings__pre">{defaultPreview || '—'}</pre>
      </details>
    </div>
  )
}
