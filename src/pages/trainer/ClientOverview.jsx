import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { hydrateAdminClientWorkspace } from '../../lib/admin/adminClientHydrate'
import { getHealthCard, listMeasurements, listMemberships, listTrainingsForClient } from '../../lib/dataAccess'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { isSupabaseConfigured } from '../../lib/supabase'
import { stripDirectionControls } from '../../lib/textInput'
import { saveLocalWithSync } from '../../lib/syncService'
import { MembershipManager } from '../../components/MembershipManager'
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../../lib/bodyMeasures'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { explainInactiveMembership, pickUsableMembershipForDate, countedUsedTrainingsOnMembership } from '../../lib/membershipRules'

export function ClientOverview({ client, onReload, section = 'all', readOnly = false }) {
  const [memberships, setMemberships] = useState([])
  const [clientTrainings, setClientTrainings] = useState([])
  const [health, setHealth] = useState(null)
  const [healthForm, setHealthForm] = useState({
    height_cm: '',
    weight_kg: '',
    goal: '',
    diseases: '',
    contraindications: '',
    medications: '',
    notes: '',
  })
  const [healthEditing, setHealthEditing] = useState(false)
  const [measurements, setMeasurements] = useState([])
  const [showMeasure, setShowMeasure] = useState(false)
  const [editingMeasureId, setEditingMeasureId] = useState(null)
  const [showMeasureHistory, setShowMeasureHistory] = useState(false)
  const [measureForm, setMeasureForm] = useState({
    date: todayLocalIso(),
    neck: '',
    chest: '',
    arm_r: '',
    arm_l: '',
    waist_upper: '',
    waist_lower: '',
    glutes: '',
    thigh_r: '',
    thigh_l: '',
    calf_r: '',
    calf_l: '',
  })

  const reloadLocal = useCallback(async () => {
    const m = await listMemberships(client.id)
    setMemberships(m)
    setClientTrainings(await listTrainingsForClient(client.id))
    const hc = await getHealthCard(client.id)
    setHealth(hc)
    setHealthForm({
      height_cm: hc?.height_cm != null ? String(hc.height_cm) : '',
      weight_kg: hc?.weight_kg != null ? String(hc.weight_kg) : '',
      goal: stripDirectionControls(hc?.goal ?? ''),
      diseases: stripDirectionControls(hc?.diseases ?? ''),
      contraindications: stripDirectionControls(hc?.contraindications ?? ''),
      medications: stripDirectionControls(hc?.medications ?? ''),
      notes: stripDirectionControls(hc?.notes ?? ''),
    })
    setMeasurements(await listMeasurements(client.id))
  }, [client.id])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  useDebouncedStorageReload(() => reloadLocal(), {
    shouldRun: (d) => d?.reason !== 'exercises' && d?.reason !== 'challenge-trainings',
  })

  useEffect(() => {
    if (section !== 'health' && section !== 'all') return
    let cancelled = false
    ;(async () => {
      if (!isSupabaseConfigured() || !navigator.onLine) return
      const existing = await listMeasurements(client.id)
      const hc = await getHealthCard(client.id)
      if (cancelled || existing.length > 0 || hc) return
      const h = await hydrateAdminClientWorkspace(client.id, { allowBrowserFallback: false })
      if (!cancelled && h.ok) await reloadLocal()
    })()
    return () => {
      cancelled = true
    }
  }, [client.id, section, reloadLocal])

  const todayIso = useMemo(() => todayLocalIso(), [])
  const active = useMemo(() => pickUsableMembershipForDate(memberships, todayIso), [memberships, todayIso])
  const inactiveHint = useMemo(
    () => (active ? null : explainInactiveMembership(memberships, todayIso)),
    [active, memberships, todayIso],
  )

  const progressPct = useMemo(() => {
    if (!active?.total_trainings) return 0
    const u = countedUsedTrainingsOnMembership(active, clientTrainings)
    const t = active.total_trainings
    return Math.min(100, Math.round((u / t) * 100))
  }, [active, clientTrainings])

  const activeUsedCount = useMemo(
    () => (active ? countedUsedTrainingsOnMembership(active, clientTrainings) : 0),
    [active, clientTrainings],
  )

  const bmi = useMemo(() => {
    const h = Number(String(healthForm.height_cm ?? '').replace(',', '.'))
    const w = Number(String(healthForm.weight_kg ?? '').replace(',', '.'))
    if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null
    const m = h / 100
    const v = w / (m * m)
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
  }, [healthForm.height_cm, healthForm.weight_kg])

  const bmiMeta = useMemo(() => {
    if (bmi == null) return null
    if (bmi < 18.5) return { key: 'under', label: 'Дефицит', color: '#60a5fa' }
    if (bmi < 25) return { key: 'normal', label: 'Норма', color: '#22c55e' }
    if (bmi < 30) return { key: 'over', label: 'Избыток', color: '#fbbf24' }
    if (bmi < 35) return { key: 'obese1', label: 'Ожирение I', color: '#fb923c' }
    if (bmi < 40) return { key: 'obese2', label: 'Ожирение II', color: '#f87171' }
    return { key: 'obese3', label: 'Ожирение III', color: '#ef4444' }
  }, [bmi])

  const bmiPct = useMemo(() => {
    if (bmi == null) return 0
    // шкала 14..40 (чуть шире нормы, чтобы маркер не упирался)
    const min = 14
    const max = 40
    const clamped = Math.min(max, Math.max(min, bmi))
    return Math.round(((clamped - min) / (max - min)) * 100)
  }, [bmi])

  const saveHealth = async (e) => {
    e.preventDefault()
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    const toNumOrNull = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    const row = {
      id: health?.id ?? crypto.randomUUID(),
      client_id: client.id,
      height_cm: toNumOrNull(healthForm.height_cm),
      weight_kg: toNumOrNull(healthForm.weight_kg),
      goal: healthForm.goal || null,
      diseases: healthForm.diseases || null,
      contraindications: healthForm.contraindications || null,
      medications: healthForm.medications || null,
      notes: healthForm.notes || null,
      updated_at: new Date().toISOString(),
    }
    try {
      await saveLocalWithSync('health_cards', row, {
        table_name: 'health_cards',
        operation: health ? 'update' : 'insert',
        remote_id: health ? row.id : null,
      })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения медкарты')
      return
    }
    setHealthEditing(false)
    await reloadLocal()
    onReload?.()
  }

  const saveMeasurement = async (e) => {
    e.preventDefault()
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    const id = editingMeasureId ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const prev = editingMeasureId ? measurements.find((m) => m.id === editingMeasureId) : null
    const row = {
      id,
      client_id: client.id,
      date: measureForm.date,
      neck: measureForm.neck ? Number(measureForm.neck) : null,
      chest: measureForm.chest ? Number(measureForm.chest) : null,
      arm_r: measureForm.arm_r ? Number(measureForm.arm_r) : null,
      arm_l: measureForm.arm_l ? Number(measureForm.arm_l) : null,
      waist_upper: measureForm.waist_upper ? Number(measureForm.waist_upper) : null,
      waist_lower: measureForm.waist_lower ? Number(measureForm.waist_lower) : null,
      glutes: measureForm.glutes ? Number(measureForm.glutes) : null,
      thigh_r: measureForm.thigh_r ? Number(measureForm.thigh_r) : null,
      thigh_l: measureForm.thigh_l ? Number(measureForm.thigh_l) : null,
      calf_r: measureForm.calf_r ? Number(measureForm.calf_r) : null,
      calf_l: measureForm.calf_l ? Number(measureForm.calf_l) : null,
      created_at: prev?.created_at ?? now,
    }
    try {
      await saveLocalWithSync('body_measurements', row, {
        table_name: 'body_measurements',
        operation: prev ? 'update' : 'insert',
        remote_id: prev ? row.id : null,
      })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения замера')
      return
    }
    setShowMeasure(false)
    setEditingMeasureId(null)
    await reloadLocal()
    onReload?.()
  }

  const lastM = measurements[0]
  const measureSummaryFields = useMemo(
    () => BODY_MEASURE_FIELDS.filter((f) => ['neck', 'chest', 'waist_upper', 'waist_lower', 'glutes', 'thigh_r', 'thigh_l'].includes(f.id)),
    [],
  )

  const openNewMeasurement = () => {
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    setEditingMeasureId(null)
    setMeasureForm({
      date: todayLocalIso(),
      neck: '',
      chest: '',
      arm_r: '',
      arm_l: '',
      waist_upper: '',
      waist_lower: '',
      glutes: '',
      thigh_r: '',
      thigh_l: '',
      calf_r: '',
      calf_l: '',
    })
    setShowMeasure(true)
  }

  const openEditMeasurement = (m) => {
    setEditingMeasureId(m.id)
    const next = {
      date: m.date ?? todayLocalIso(),
    }
    for (const f of BODY_MEASURE_FIELDS) {
      const v = getMeasureValue(m, f.id)
      next[f.id] = v != null && v !== '' ? String(v) : ''
    }
    setMeasureForm((prevF) => ({ ...prevF, ...next }))
    setShowMeasure(true)
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {(section === 'all' || section === 'memberships') && (
        <section className="card">
        <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
          Абонемент
        </h2>
        {!active && <p className="muted">{inactiveHint}</p>}
        {active && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Действует до <strong style={{ color: 'var(--accent-bright)' }}>{formatDateRu(active.end_date)}</strong>
            </p>
            <p style={{ margin: '4px 0 10px' }}>
              Использовано тренировок:{' '}
              <strong>
                {activeUsedCount} / {active.total_trainings ?? '—'}
              </strong>
            </p>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 10,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-dim), var(--accent-bright))' }} />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Использовано {progressPct}% лимита
            </p>
          </>
        )}
        {!readOnly ? (
          <MembershipManager
            clientId={client.id}
            clubId={client.club_id}
            recordTrainerId={client.trainer_id}
            onChanged={() => {
              void reloadLocal()
              void onReload?.()
            }}
          />
        ) : (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Клиент в архиве — абонементы можно менять только после «Вернуть из архива».
          </p>
        )}
        </section>
      )}

      {(section === 'all' || section === 'health') && (
        <section className="card">
        <div className="row">
          <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
            Карта здоровья
          </h2>
          {!healthEditing && !readOnly ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon-square"
              aria-label="Редактировать карту здоровья"
              title="Редактировать"
              onClick={() => setHealthEditing(true)}
            >
              <Pencil size={16} aria-hidden />
            </button>
          ) : null}
        </div>
        {!healthEditing ? (
          <div className="grid health-mini">
            <div className="health-mini__top">
              <div className="health-mini__metric">
                <span className="muted">Рост</span>
                <strong>{healthForm.height_cm ? `${healthForm.height_cm} см` : '—'}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">Вес</span>
                <strong>{healthForm.weight_kg ? `${healthForm.weight_kg} кг` : '—'}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">ИМТ</span>
                <strong style={{ color: bmiMeta?.color ?? 'var(--text)' }}>
                  {bmi != null ? bmi : '—'}
                  {bmiMeta ? ` · ${bmiMeta.label}` : ''}
                </strong>
              </div>
            </div>

            <div className="health-bmi" aria-label="Шкала ИМТ">
              <div className="health-bmi__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bmiPct}>
                <span className="health-bmi__seg health-bmi__seg--under" />
                <span className="health-bmi__seg health-bmi__seg--normal" />
                <span className="health-bmi__seg health-bmi__seg--over" />
                <span className="health-bmi__seg health-bmi__seg--obese" />
                {bmi != null ? (
                  <span className="health-bmi__marker" style={{ left: `${bmiPct}%`, background: bmiMeta?.color ?? 'var(--accent-bright)' }} />
                ) : null}
              </div>
              <div className="health-bmi__ticks">
                <span>18.5</span>
                <span>25</span>
                <span>30</span>
                <span>40</span>
              </div>
            </div>
            <p>
              <span className="muted">Цель:</span> {healthForm.goal || '—'}
            </p>
            <p>
              <span className="muted">Заболевания:</span> {healthForm.diseases || '—'}
            </p>
            <p>
              <span className="muted">Противопоказания:</span> {healthForm.contraindications || '—'}
            </p>
            <p>
              <span className="muted">Препараты:</span> {healthForm.medications || '—'}
            </p>
            <p>
              <span className="muted">Заметки:</span> {healthForm.notes || '—'}
            </p>
          </div>
        ) : (
          <form onSubmit={saveHealth} className="grid health-form">
            <div className="grid grid-2 health-form__metrics">
              <div className="field">
                <label className="label">Рост (см)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Напр. 178"
                  value={healthForm.height_cm}
                  onChange={(e) => setHealthForm((f) => ({ ...f, height_cm: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="label">Вес (кг)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Напр. 82.5"
                  value={healthForm.weight_kg}
                  onChange={(e) => setHealthForm((f) => ({ ...f, weight_kg: e.target.value }))}
                />
              </div>
            </div>
            <div className="health-form__bmi">
              <div className="health-form__bmi-row">
                <span className="muted">ИМТ</span>
                <strong style={{ color: bmiMeta?.color ?? 'var(--text)' }}>{bmi != null ? bmi : '—'}</strong>
                <span className="muted">{bmiMeta ? bmiMeta.label : ''}</span>
              </div>
              <div className="health-bmi">
                <div className="health-bmi__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bmiPct}>
                  <span className="health-bmi__seg health-bmi__seg--under" />
                  <span className="health-bmi__seg health-bmi__seg--normal" />
                  <span className="health-bmi__seg health-bmi__seg--over" />
                  <span className="health-bmi__seg health-bmi__seg--obese" />
                  {bmi != null ? (
                    <span className="health-bmi__marker" style={{ left: `${bmiPct}%`, background: bmiMeta?.color ?? 'var(--accent-bright)' }} />
                  ) : null}
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label">Цель</label>
              <textarea
                className="textarea"
                value={healthForm.goal}
                onChange={(e) => setHealthForm((f) => ({ ...f, goal: stripDirectionControls(e.target.value) }))}
                placeholder="Напр. Снижение веса, набор массы, улучшить выносливость..."
              />
            </div>
            <div className="field">
              <label className="label">Заболевания</label>
              <textarea className="textarea" value={healthForm.diseases} onChange={(e) => setHealthForm((f) => ({ ...f, diseases: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Противопоказания</label>
              <textarea className="textarea" value={healthForm.contraindications} onChange={(e) => setHealthForm((f) => ({ ...f, contraindications: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Препараты</label>
              <textarea className="textarea" value={healthForm.medications} onChange={(e) => setHealthForm((f) => ({ ...f, medications: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Заметки</label>
              <textarea className="textarea" value={healthForm.notes} onChange={(e) => setHealthForm((f) => ({ ...f, notes: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary btn-touch">
                Сохранить
              </button>
              <button type="button" className="btn btn-ghost btn-touch" onClick={() => setHealthEditing(false)}>
                Отмена
              </button>
            </div>
          </form>
        )}
        </section>
      )}

      {(section === 'all' || section === 'health') && (
        <section className="card">
        <div className="row">
          <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
            Обмеры тела (последние)
          </h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {measurements.length > 1 ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowMeasureHistory(true)}>
                История ({measurements.length})
              </button>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                className="btn btn-primary btn-icon-square"
                onClick={openNewMeasurement}
                aria-label="Новый замер"
                title="Новый замер"
              >
                <Plus size={20} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        {!lastM && <p className="muted">Нет замеров.</p>}
        {lastM && (
          <div className="measure-summary" style={{ marginTop: 10 }}>
            <div className="measure-summary__top">
              <div className="muted" style={{ margin: 0 }}>
                Дата: <strong style={{ color: 'var(--text)' }}>{formatDateRu(lastM.date)}</strong>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square"
                  aria-label="Редактировать замер"
                  title="Редактировать"
                  onClick={() => openEditMeasurement(lastM)}
                >
                  <Pencil size={16} aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="measure-grid">
              {measureSummaryFields.map((f) => (
                <div key={f.id} className="measure-tile">
                  <div className="measure-tile__label">{f.label}</div>
                  <div className="measure-tile__value">{getMeasureValue(lastM, f.id) ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        </section>
      )}

      {showMeasureHistory && (section === 'all' || section === 'health') && (
        <div className="modal-overlay" onClick={() => setShowMeasureHistory(false)}>
          <div className="modal-panel measure-history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                История замеров
              </h2>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowMeasureHistory(false)}>
                Закрыть
              </button>
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="measure-history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th className="muted">Кратко</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateRu(m.date)}</td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {BODY_MEASURE_FIELDS.slice(0, 4)
                          .map((f) => `${f.label}: ${getMeasureValue(m, f.id) ?? '—'}`)
                          .join(' · ')}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square"
                          aria-label="Редактировать замер"
                          title="Редактировать"
                          onClick={() => {
                            openEditMeasurement(m)
                            setShowMeasureHistory(false)
                          }}
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showMeasure && (section === 'all' || section === 'health') && (
        <div className="modal-overlay" onClick={() => setShowMeasure(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="section-title" style={{ fontSize: '1.1rem' }}>
              {editingMeasureId ? 'Редактировать замер' : 'Новый замер'}
            </h2>
            <form onSubmit={saveMeasurement} className="grid" style={{ gap: 10 }}>
              <div className="field">
                <label className="label">Дата</label>
                <input className="input" type="date" required value={measureForm.date} onChange={(e) => setMeasureForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid grid-2" style={{ gap: 8 }}>
                {BODY_MEASURE_FIELDS.map((f) => (
                  <div
                    key={f.id}
                    className="field"
                    style={{
                      marginBottom: 0,
                      ...(f.id === 'glutes' ? { gridColumn: '1 / -1' } : null),
                    }}
                  >
                    <label className="label">{f.label}</label>
                    <input className="input" type="number" step="0.1" value={measureForm[f.id]} onChange={(e) => setMeasureForm((x) => ({ ...x, [f.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowMeasure(false)}>
                  Закрыть
                </button>
                <button type="submit" className="btn btn-primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
