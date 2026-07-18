import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw, Save } from 'lucide-react'
import {
  defaultCoachQualityConfig,
  normalizeCoachQualityConfig,
  coachQualityToggleMeta,
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
    setConfig((c) => normalizeCoachQualityConfig({ ...c, [key]: n }))
  }

  const setToggle = (key, on) => {
    setConfig((c) => ({ ...c, [key]: Boolean(on) }))
  }

  const onSave = async () => {
    if (!clubId) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveCoachQualitySettings(clubId, { config })
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
    if (!window.confirm('Сбросить к стандарту FIT-CITY (40/40/20, все тумблеры вкл)?')) return
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
    <section className="card">
      <AdminSectionHeader
        title="Качество ведения"
        lead="Веса осей и тумблеры правил — одинаково для статистики админа и тренера."
      />

      <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <label className="muted" style={{ fontSize: 13 }}>
          Клуб
          <select
            className="input"
            style={{ marginLeft: 8, minWidth: 200 }}
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
        {clubName ? <span className="muted" style={{ fontSize: 13 }}>{clubName}</span> : null}
      </div>

      {migrationNeeded ? (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Таблица в базе ещё не создана — сейчас действует стандарт. После миграции{' '}
          <code>club_coach_quality_settings</code> сохранение заработает.
        </p>
      ) : null}

      <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
        Веса осей (сумма {weightSum}%)
      </h3>
      <div className="grid" style={{ gap: 10, marginBottom: 16, maxWidth: 420 }}>
        <WeightRow
          label="Ведение"
          value={config.weightCare}
          onChange={(v) => setWeight('weightCare', v)}
          disabled={busy}
        />
        <WeightRow
          label="Глубина"
          value={config.weightDepth}
          onChange={(v) => setWeight('weightDepth', v)}
          disabled={busy}
        />
        <WeightRow
          label="Хвосты"
          value={config.weightBag}
          onChange={(v) => setWeight('weightBag', v)}
          disabled={busy}
        />
      </div>
      {weightSum !== 100 ? (
        <p style={{ color: 'var(--warning, #fbbf24)', fontSize: 13, margin: '0 0 12px' }}>
          Сумма должна быть 100% (при сохранении веса нормализуются).
        </p>
      ) : null}

      {Object.entries(groups).map(([group, items]) => (
        <div key={group} style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
            {group}
          </h3>
          <div className="grid" style={{ gap: 8 }}>
            {items.map((t) => (
              <label
                key={t.key}
                className="row"
                style={{
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid color-mix(in srgb, var(--border, #2a3a32) 80%, transparent)',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(config[t.key])}
                  onChange={(e) => setToggle(t.key, e.target.checked)}
                  disabled={busy}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong style={{ fontSize: 14 }}>{t.label}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                    {t.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {rulesPreview.length ? (
        <div style={{ marginBottom: 14 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 6px' }}>
            Как будет считаться
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {rulesPreview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !clubId} onClick={() => void onSave()}>
          <Save size={16} aria-hidden />
          Сохранить
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || !clubId} onClick={() => void onReset()}>
          <RotateCcw size={16} aria-hidden />
          Стандарт FIT-CITY
        </button>
      </div>
      {msg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--success, #4ade80)' }}>{msg}</p> : null}
      {err ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--danger, #f87171)' }}>{err}</p> : null}
    </section>
  )
}

function WeightRow({ label, value, onChange, disabled }) {
  return (
    <label className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 14, minWidth: 80 }}>{label}</span>
      <input
        type="number"
        className="input"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 80, textAlign: 'right' }}
      />
      <span className="muted" style={{ fontSize: 13 }}>
        %
      </span>
    </label>
  )
}
