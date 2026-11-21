import { useEffect, useState } from 'react'
import { fetchClientFoodDiaryDay } from '../../lib/client/foodDiaryTrainerService.js'
import { todayInTimeZoneIso } from '../../lib/dateRu'

/**
 * Блок на экране рациона: факт дня vs цель плана.
 */
export function ClientFoodDiaryTrainerGlance({ clientId, readOnly = false }) {
  const [state, setState] = useState(/** @type {'loading'|'off'|'ok'|'err'} */ ('loading'))
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    void (async () => {
      setState('loading')
      setError('')
      try {
        const date = todayInTimeZoneIso()
        const data = await fetchClientFoodDiaryDay({ clientId, date })
        if (cancelled) return
        if (data?.enabled === false) {
          setState('off')
          setPayload(null)
          return
        }
        setPayload(data)
        setState('ok')
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'Не удалось загрузить дневник')
        setState('err')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (state === 'off') return null
  if (state === 'loading') {
    return (
      <section className="card food-diary-trainer-glance" aria-busy="true">
        <p className="muted" style={{ margin: 0 }}>
          Дневник калорий…
        </p>
      </section>
    )
  }
  if (state === 'err') {
    return (
      <section className="card food-diary-trainer-glance" role="status">
        <p className="muted" style={{ margin: 0 }}>
          {error}
        </p>
      </section>
    )
  }

  const totals = payload?.totals
  const vs = payload?.vs_plan
  const kcal = Math.round(totals?.kcal || 0)

  return (
    <section className="card food-diary-trainer-glance" aria-label="Дневник калорий клиента">
      <header className="food-diary-trainer-glance__head">
        <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
          Дневник сегодня
        </h2>
        <span className="muted">{payload?.entry_date}</span>
      </header>
      <p className="food-diary-trainer-glance__kcal">
        <strong>{kcal}</strong> ккал
        {vs?.has_plan ? (
          <span className="muted">
            {' '}
            · цель рациона {vs.plan_kcal} ({vs.delta_kcal > 0 ? '+' : ''}
            {vs.delta_kcal})
          </span>
        ) : (
          <span className="muted"> · рациона нет</span>
        )}
      </p>
      <p className="muted food-diary-trainer-glance__bju">
        Б {Math.round(totals?.protein_g || 0)} · Ж {Math.round(totals?.fat_g || 0)} · У{' '}
        {Math.round(totals?.carbs_g || 0)}
        {payload?.water_ml != null ? ` · вода ${payload.water_ml} мл` : ''}
      </p>
      {vs?.label_ru ? <p className="food-diary-trainer-glance__status">{vs.label_ru}</p> : null}
      {!readOnly && (totals?.count || 0) === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Клиент ещё ничего не записал за день.
        </p>
      ) : null}
    </section>
  )
}
