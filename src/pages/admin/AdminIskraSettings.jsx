import { useCallback, useEffect, useState } from 'react'

import { useSearchParams } from 'react-router-dom'

import {

  ChevronDown,

  ChevronUp,

  Plus,

  RotateCcw,

  Save,

  Sparkles,

  Trash2,

} from 'lucide-react'

import { ISKRA_FULL_NAME } from '../../lib/admin/geminiIskraCore.js'

import {

  defaultIskraQuickChips,

  iskraBuiltinHandlerOptions,

  ISKRA_QUICK_CHIP_LIMITS,

} from '../../lib/admin/iskraQuickChipsCore.js'

import { fetchIskraSettings, saveIskraSettings } from '../../lib/admin/iskraSettingsService.js'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { IskraPlaybooksSection } from '../../components/iskra/IskraPlaybooksSection.jsx'
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



const HANDLER_OPTIONS = [{ id: '', label: 'Gemini (свой вопрос)' }, ...iskraBuiltinHandlerOptions()]



function newChipId() {

  if (typeof crypto !== 'undefined' && crypto.randomUUID) {

    return `custom_${crypto.randomUUID().slice(0, 8)}`

  }

  return `custom_${Date.now().toString(36)}`

}



/** @param {unknown} chips */

function cloneChips(chips) {

  return (Array.isArray(chips) ? chips : []).map((c) => ({

    id: String(c?.id ?? ''),

    label: String(c?.label ?? ''),

    message: String(c?.message ?? ''),

    compare: c?.compare === true,

    handler_id: c?.handler_id ? String(c.handler_id) : null,

  }))

}



function chipsEqual(a, b) {

  return JSON.stringify(a) === JSON.stringify(b)

}



export function AdminIskraSettings() {

  const { supabaseReady } = useAuth()

  const [searchParams] = useSearchParams()

  const clubId = searchParams.get('club')?.trim() ?? ''



  const [clubName, setClubName] = useState('—')

  const [promptAppend, setPromptAppend] = useState('')

  const [defaultPreview, setDefaultPreview] = useState('')

  const [savedAppend, setSavedAppend] = useState('')

  const [quickChips, setQuickChips] = useState(() => defaultIskraQuickChips())

  const [savedQuickChips, setSavedQuickChips] = useState(() => defaultIskraQuickChips())

  const [chipsCustom, setChipsCustom] = useState(false)

  const [sparkBriefEnabled, setSparkBriefEnabled] = useState(true)

  const [savedSparkBriefEnabled, setSavedSparkBriefEnabled] = useState(true)

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

      const chips = cloneChips(data?.quick_chips ?? defaultIskraQuickChips())

      setPromptAppend(append)

      setSavedAppend(append)

      setQuickChips(chips)

      setSavedQuickChips(chips)

      setChipsCustom(data?.quick_chips_custom === true)

      setSparkBriefEnabled(data?.spark_brief_enabled !== false)

      setSavedSparkBriefEnabled(data?.spark_brief_enabled !== false)

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

      const data = await saveIskraSettings(clubId, {

        promptAppend,

        quickChips,

        sparkBriefEnabled,

      })

      const chips = cloneChips(data?.quick_chips ?? quickChips)

      setSavedAppend(promptAppend)

      setSavedQuickChips(chips)

      setQuickChips(chips)

      setChipsCustom(data?.quick_chips_custom === true)

      setSparkBriefEnabled(data?.spark_brief_enabled !== false)

      setSavedSparkBriefEnabled(data?.spark_brief_enabled !== false)

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



  const onResetChips = () => {

    const defaults = defaultIskraQuickChips()

    setQuickChips(defaults)

    setMsg('Кнопки сброшены к стандартным — нажмите «Сохранить»')

  }



  const updateChip = (index, patch) => {

    setQuickChips((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))

  }



  const moveChip = (index, delta) => {

    setQuickChips((prev) => {

      const next = [...prev]

      const target = index + delta

      if (target < 0 || target >= next.length) return prev

      ;[next[index], next[target]] = [next[target], next[index]]

      return next

    })

  }



  const removeChip = (index) => {

    setQuickChips((prev) => prev.filter((_, i) => i !== index))

  }



  const addChip = () => {

    setQuickChips((prev) => {

      if (prev.length >= ISKRA_QUICK_CHIP_LIMITS.maxChips) return prev

      return [

        ...prev,

        {

          id: newChipId(),

          label: 'Новая кнопка',

          message: 'Ваш вопрос для ИСКРЫ',

          compare: false,

          handler_id: null,

        },

      ]

    })

  }



  const dirty =
    promptAppend !== savedAppend ||
    !chipsEqual(quickChips, savedQuickChips) ||
    sparkBriefEnabled !== savedSparkBriefEnabled



  return (

    <div className="admin-iskra-settings admin-section-shell">

      <AdminSectionHeader
        icon={Sparkles}
        title={ISKRA_FULL_NAME}
        lead={clubName !== '—' ? `Филиал «${clubName}»` : 'Выберите клуб в шапке'}
      />



      {err ? (

        <p className="admin-iskra-settings__error" role="alert">

          {err}

        </p>

      ) : null}

      {msg ? <p className="admin-iskra-settings__ok">{msg}</p> : null}



      <section className="card admin-iskra-settings__section">

        <h2 className="section-title">Утренний бриф SparkBrief</h2>

        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>

          Короткая сводка при открытии ИСКРЫ: план, главный риск и кнопка «Сделать». Можно скрыть на сегодня — бриф

          вернётся в следующем месяце.

        </p>

        <label className="admin-iskra-settings__check">

          <input

            type="checkbox"

            checked={sparkBriefEnabled}

            onChange={(e) => setSparkBriefEnabled(e.target.checked)}

            disabled={!clubId || saving || loading}

          />

          Показывать SparkBrief при открытии ИСКРЫ

        </label>

      </section>



      <section className="card admin-iskra-settings__section">

        <h2 className="section-title">Быстрые кнопки в панели ✨</h2>

        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>

          Подпись и текст вопроса на кнопках ИСКРЫ для этого клуба. «Готовый ответ» — мгновенная сводка из отчёта без

          Gemini; «Gemini» — произвольный вопрос модели. Пустой список после сохранения не допускается — минимум одна

          кнопка.

        </p>

        {loading ? (

          <p className="muted">Загрузка…</p>

        ) : (

          <>

            <p className="admin-iskra-settings__chips-meta muted">

              {quickChips.length} / {ISKRA_QUICK_CHIP_LIMITS.maxChips} кнопок

              {chipsCustom ? ' · настроено для клуба' : ' · стандартный набор'}

              {dirty ? ' · есть несохранённые изменения' : ''}

            </p>

            <ul className="admin-iskra-settings__chips-list">

              {quickChips.map((chip, index) => (

                <li key={chip.id || index} className="admin-iskra-settings__chip-row">

                  <div className="admin-iskra-settings__chip-order">

                    <button

                      type="button"

                      className="btn btn-ghost btn-sm"

                      aria-label="Выше"

                      disabled={index === 0 || saving}

                      onClick={() => moveChip(index, -1)}

                    >

                      <ChevronUp size={16} />

                    </button>

                    <button

                      type="button"

                      className="btn btn-ghost btn-sm"

                      aria-label="Ниже"

                      disabled={index === quickChips.length - 1 || saving}

                      onClick={() => moveChip(index, 1)}

                    >

                      <ChevronDown size={16} />

                    </button>

                  </div>

                  <div className="admin-iskra-settings__chip-fields">

                    <label className="admin-iskra-settings__label">

                      Подпись на кнопке

                      <input

                        className="admin-iskra-settings__input"

                        value={chip.label}

                        maxLength={ISKRA_QUICK_CHIP_LIMITS.maxLabel}

                        disabled={!clubId || saving}

                        onChange={(e) => updateChip(index, { label: e.target.value })}

                      />

                    </label>

                    <label className="admin-iskra-settings__label">

                      Текст вопроса (отправляется ИСКРЕ)

                      <textarea

                        className="admin-iskra-settings__chip-message"

                        rows={2}

                        value={chip.message}

                        maxLength={ISKRA_QUICK_CHIP_LIMITS.maxMessage}

                        disabled={!clubId || saving}

                        onChange={(e) => updateChip(index, { message: e.target.value })}

                      />

                    </label>

                    <div className="admin-iskra-settings__chip-row-bottom">

                      <label className="admin-iskra-settings__handler">

                        Ответ

                        <select

                          className="admin-iskra-settings__select"

                          value={chip.handler_id ?? ''}

                          disabled={!clubId || saving}

                          onChange={(e) =>

                            updateChip(index, {

                              handler_id: e.target.value ? e.target.value : null,

                            })

                          }

                        >

                          {HANDLER_OPTIONS.map((opt) => (

                            <option key={opt.id || 'gemini'} value={opt.id}>

                              {opt.label}

                            </option>

                          ))}

                        </select>

                      </label>

                      <label className="admin-iskra-settings__compare">

                        <input

                          type="checkbox"

                          checked={chip.compare === true}

                          disabled={!clubId || saving}

                          onChange={(e) => updateChip(index, { compare: e.target.checked })}

                        />

                        Нужен прошлый месяц

                      </label>

                      <button

                        type="button"

                        className="btn btn-ghost btn-sm admin-iskra-settings__chip-delete"

                        disabled={!clubId || saving || quickChips.length <= 1}

                        onClick={() => removeChip(index)}

                      >

                        <Trash2 size={15} aria-hidden />

                        Удалить

                      </button>

                    </div>

                  </div>

                </li>

              ))}

            </ul>

            <div className="row admin-iskra-settings__actions">

              <button

                type="button"

                className="btn btn-primary"

                disabled={!clubId || saving || !dirty}

                onClick={() => void onSave()}

              >

                <Save size={16} aria-hidden />

                Сохранить

              </button>

              <button

                type="button"

                className="btn btn-secondary"

                disabled={!clubId || saving || quickChips.length >= ISKRA_QUICK_CHIP_LIMITS.maxChips}

                onClick={addChip}

              >

                <Plus size={16} aria-hidden />

                Добавить кнопку

              </button>

              <button type="button" className="btn btn-secondary" disabled={!clubId || saving} onClick={onResetChips}>

                <RotateCcw size={16} aria-hidden />

                Стандартные кнопки

              </button>

            </div>

            {dirty ? (

              <p className="admin-iskra-settings__dirty-hint muted">

                Изменения пока только на экране — нажмите «Сохранить», чтобы они появились в панели ✨.

              </p>

            ) : null}

          </>

        )}

      </section>



      <IskraPlaybooksSection clubId={clubId} disabled={!clubId || saving || loading} />



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

