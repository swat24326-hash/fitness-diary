import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Gauge, RotateCcw, Save } from 'lucide-react'
import {
  defaultCoachQualityConfig,
  normalizeCoachQualityConfig,
  coachQualityToggleMeta,
  coachQualityRulesHelpFromConfig,
  CARE_SUB_KEYS,
  BAG_SUB_KEYS,
  sumEnabledSubWeights,
} from '../../lib/admin/coachQualityConfigCore.js'
import {
  fetchCoachQualitySettings,
  saveCoachQualitySettings,
} from '../../lib/admin/coachQualitySettingsService.js'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { useAuth } from '../../context/AuthContext'

/**
 * Структура → Качество ведения: веса осей и тумблеры правил.
 */
export function AdminCoachQualitySettings() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const clubFromUrl = String(searchParams.get('club') ?? '').trim()
  const [clubId, setClubId] = useState(clubFromUrl || String(profile?.club_id ?? '').trim())
  const [clubs, setClubs] = useState([])
  const [config, setConfig] = useState(() => defaultCoachQualityConfig())
  const [defaults, setDefaults] = useState(() => defaultCoachQualityConfig())
  const [clubName, setClubName] = useState('')
  const [rulesPreview, setRulesPreview] = useState([])
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const toggles = useMemo(() => coachQualityToggleMeta(), [])
  const weightSum = config.weightCare + config.weightDepth + config.weightBag
  const careSub = sumEnabledSubWeights(config, CARE_SUB_KEYS)
  const bagSub = sumEnabledSubWeights(config, BAG_SUB_KEYS)
  const liveRules = useMemo(() => coachQualityRulesHelpFromConfig(config), [config])
  const rulesLines = liveRules.length ? liveRules : rulesPreview

  const canSave =
    Boolean(clubId) &&
    !busy &&
    weightSum === 100 &&
    (careSub.enabled === 0 || careSub.sum === 100) &&
    (bagSub.enabled === 0 || bagSub.sum === 100)

  const loadClubs = useCallback(async () => {
    try {
      await pullClubsFromSupabase().catch(() => {})
      const list = await listClubsLocal()
      setClubs(list ?? [])
      if (!clubId && list?.[0]?.id) setClubId(String(list[0].id))
    } catch {
      setClubs([])
    }
  }, [clubId])

  const load = useCallback(async (cid) => {
    if (!cid) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await fetchCoachQualitySettings(cid)
      setConfig(normalizeCoachQualityConfig(data?.config))
      setDefaults(normalizeCoachQualityConfig(data?.default_config ?? defaultCoachQualityConfig()))
      setClubName(String(data?.club_name ?? ''))
      setRulesPreview(Array.isArray(data?.rules_preview) ? data.rules_preview : [])
      setMigrationNeeded(Boolean(data?.migration_needed))
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadClubs()
  }, [loadClubs])

  useEffect(() => {
    if (clubFromUrl) setClubId(clubFromUrl)
  }, [clubFromUrl])

  useEffect(() => {
    if (clubId) void load(clubId)
  }, [clubId, load])

  const setWeight = (key, value) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0))
    setConfig((c) => normalizeCoachQualityConfig({ ...c, [key]: n }, { redistributeSubs: false }))
  }

  const setToggle = (key, on) => {
    setConfig((c) => {
      const next = { ...c, [key]: Boolean(on) }
      const meta = toggles.find((t) => t.key === key)
      if (meta?.subWeightKey && !on) next[meta.subWeightKey] = 0
      return normalizeCoachQualityConfig(next, { redistributeSubs: false })
    })
  }

  const setSubWeight = (key, value) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0))
    setConfig((c) => normalizeCoachQualityConfig({ ...c, [key]: n }, { redistributeSubs: false }))
  }

  const onSave = async () => {
    if (!clubId) return
    if (weightSum !== 100) {
      setErr('Сумма весов осей должна быть 100%')
      return
    }
    if (careSub.enabled > 0 && careSub.sum !== 100) {
      setErr('Сумма долей внутри «Ведение» должна быть 100%')
      return
    }
    if (bagSub.enabled > 0 && bagSub.sum !== 100) {
      setErr('Сумма долей внутри «Хвосты» должна быть 100%')
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const toSave = normalizeCoachQualityConfig(config)
      const data = await saveCoachQualitySettings(clubId, { config: toSave })
      setConfig(normalizeCoachQualityConfig(data?.config))
      setRulesPreview(Array.isArray(data?.rules_preview) ? data.rules_preview : [])
      setMsg('Сохранено. Статистика клуба будет считать по новым правилам.')
      setMigrationNeeded(false)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    if (!clubId) return
    if (!window.confirm('Сбросить к стандарту Ось (40/40/20, все тумблеры вкл)?')) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveCoachQualitySettings(clubId, { reset: true })
      setConfig(normalizeCoachQualityConfig(data?.config ?? defaults))
      setRulesPreview(Array.isArray(data?.rules_preview) ? data.rules_preview : [])
      setMsg('Сброшено к стандарту.')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Ошибка сброса')
    } finally {
      setBusy(false)
    }
  }

  const groups = useMemo(() => {
    /** @type {Record<string, typeof toggles>} */
    const map = {}
    for (const t of toggles) {
      if (!map[t.group]) map[t.group] = []
      map[t.group].push(t)
    }
    return map
  }, [toggles])

  return (
    <section className="card cq-settings">
      <AdminSectionHeader
        title="Качество ведения"
        lead="Веса осей, доли внутри ведения и хвостов, тумблеры — одинаково для статистики админа и тренера."
        icon={Gauge}
      />

      <div className="cq-settings__toolbar">
        <label className="cq-settings__club">
          <span className="cq-settings__club-label">Клуб</span>
          <select
            className="input cq-settings__club-select"
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            disabled={busy}
          >
            {!clubId ? <option value="">Выберите клуб</option> : null}
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </label>
        {clubName ? <span className="cq-settings__club-name muted">{clubName}</span> : null}
      </div>

      {migrationNeeded ? (
        <p className="admin-section__banner admin-section__banner--warn">
          Таблица в базе ещё не создана — сейчас действует стандарт. После миграции{' '}
          <code>club_coach_quality_settings</code> сохранение заработает.
        </p>
      ) : null}

      <div className="cq-settings__layout">
        <div className="cq-settings__main">
          <div className="cq-settings__block">
            <div className="cq-settings__block-head">
              <h3 className="cq-settings__block-title">Веса осей</h3>
              <span className={`cq-settings__sum${weightSum === 100 ? '' : ' cq-settings__sum--bad'}`}>
                сумма {weightSum}%
              </span>
            </div>
            <div className="cq-settings__weights">
              <WeightField
                label="Ведение"
                value={config.weightCare}
                onChange={(v) => setWeight('weightCare', v)}
                disabled={busy}
              />
              <WeightField
                label="Глубина"
                value={config.weightDepth}
                onChange={(v) => setWeight('weightDepth', v)}
                disabled={busy}
              />
              <WeightField
                label="Хвосты"
                value={config.weightBag}
                onChange={(v) => setWeight('weightBag', v)}
                disabled={busy}
              />
            </div>
            {weightSum !== 100 ? (
              <p className="cq-settings__hint cq-settings__hint--warn">
                Сумма должна быть 100% (при сохранении веса нормализуются).
              </p>
            ) : (
              <p className="cq-settings__hint muted">Доля каждой оси в итоговом балле 0–100.</p>
            )}
          </div>

          <div className="cq-settings__groups">
            {Object.entries(groups).map(([group, items]) => {
              const withSubs = items.filter((t) => t.subWeightKey)
              const subInfo =
                group === 'Ведение' ? careSub : group === 'Хвосты' ? bagSub : { sum: 0, enabled: 0 }
              return (
                <div key={group} className="cq-settings__group">
                  <div className="cq-settings__group-head">
                    <h3 className="cq-settings__group-title">{group}</h3>
                    {subInfo.enabled > 0 ? (
                      <span
                        className={`cq-settings__sum${subInfo.sum === 100 ? '' : ' cq-settings__sum--bad'}`}
                      >
                        внутри оси {subInfo.sum}%
                      </span>
                    ) : group === 'Глубина' ? (
                      <span className="cq-settings__sum">= вес оси {config.weightDepth}%</span>
                    ) : withSubs.length > 0 ? (
                      <span className="cq-settings__sum muted">пункты выкл.</span>
                    ) : null}
                  </div>
                  <ul className="cq-settings__toggles">
                    {items.map((t) => (
                      <li key={t.key}>
                        <div className="cq-settings__toggle-row">
                          <label className="cq-settings__toggle">
                            <input
                              type="checkbox"
                              className="cq-settings__checkbox"
                              checked={Boolean(config[t.key])}
                              onChange={(e) => setToggle(t.key, e.target.checked)}
                              disabled={busy}
                            />
                            <span className="cq-settings__toggle-text">
                              <span className="cq-settings__toggle-label">{t.label}</span>
                              <span className="cq-settings__toggle-hint muted">{t.hint}</span>
                            </span>
                          </label>
                          {t.subWeightKey ? (
                            <label className="cq-settings__sub">
                              <input
                                type="number"
                                className="input cq-settings__sub-input"
                                min={0}
                                max={100}
                                step={1}
                                value={config[t.key] ? config[t.subWeightKey] : 0}
                                disabled={busy || !config[t.key]}
                                onChange={(e) => setSubWeight(t.subWeightKey, e.target.value)}
                                aria-label={`Доля внутри оси: ${t.label}`}
                              />
                              <span className="muted">%</span>
                            </label>
                          ) : t.key === 'toggleStuckScoreCap' ? (
                            <span className="cq-settings__sub-note muted">без %</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="cq-settings__aside">
          {rulesLines.length ? (
            <div className="cq-settings__preview">
              <h3 className="cq-settings__block-title">Как будет считаться</h3>
              <ul className="cq-settings__preview-list">
                {rulesLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="cq-settings__preview cq-settings__preview--empty">
              <h3 className="cq-settings__block-title">Как будет считаться</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Выберите клуб — здесь появится текст правил по текущим настройкам.
              </p>
            </div>
          )}

          <div className="cq-settings__actions">
            <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void onSave()}>
              <Save size={16} aria-hidden />
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !clubId}
              onClick={() => void onReset()}
            >
              <RotateCcw size={16} aria-hidden />
              Стандарт Ось
            </button>
          </div>
          {!canSave && clubId && !busy ? (
            <p className="cq-settings__hint cq-settings__hint--warn">
              Чтобы сохранить: сумма осей и долей внутри включённых групп = 100%.
            </p>
          ) : null}
          {msg ? <p className="cq-settings__status cq-settings__status--ok">{msg}</p> : null}
          {err ? <p className="cq-settings__status cq-settings__status--err">{err}</p> : null}
        </aside>
      </div>
    </section>
  )
}

function WeightField({ label, value, onChange, disabled }) {
  return (
    <label className="cq-settings__weight">
      <span className="cq-settings__weight-label">{label}</span>
      <span className="cq-settings__weight-input-wrap">
        <input
          type="number"
          className="input cq-settings__weight-input"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="cq-settings__weight-unit muted">%</span>
      </span>
    </label>
  )
}
