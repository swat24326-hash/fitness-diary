import { useEffect, useRef, useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import { clientNutritionDayView } from '../../lib/client/clientNutritionDayCore.js'
import { clientHomeworkTitle, planFootRu } from '../../lib/client/clientPlanUiCore.js'

function fmt(n) {
  return String(Math.round(Number(n) || 0))
}

function Head({ item, title }) {
  return (
    <header className="client-plan__head">
      <h2 className="client-plan__title">{title}</h2>
      <p className="client-me-muted">{planFootRu(item)}</p>
    </header>
  )
}

/** Задание от тренера: блоки упражнений с нормами «3 × 12 · отдых 30 с» и комментарий тренера клиенту. */
export function ClientHomeworkView({ item }) {
  const p = item.payload
  const starts = p.blocks.map((_, bi) => p.blocks.slice(0, bi).reduce((sum, b) => sum + b.exercises.length, 0))
  return (
    <section className="client-me-card client-plan">
      <Head item={item} title={clientHomeworkTitle(p.title)} />
      {p.comment ? (
        <p className="client-plan__note">
          <MessageSquareQuote size={18} aria-hidden />
          <span>{p.comment}</span>
        </p>
      ) : null}
      {p.blocks.map((b, bi) => (
        <div key={`${b.label}-${bi}`} className="client-plan__block">
          {p.blocks.length > 1 || b.label !== 'Основное' ? <h3 className="client-plan__block-title">{b.label}</h3> : null}
          <ol className="client-plan__list">
            {b.exercises.map((ex, ei) => {
              const n = starts[bi] + ei + 1
              return (
                <li key={`${ex.name}-${n}`} className="client-plan__row" style={{ '--i': n }}>
                  <span className="client-plan__num" aria-hidden>
                    {n}
                  </span>
                  <span className="client-plan__name">
                    {ex.name}
                    {ex.how || ex.tip ? (
                      <details className="client-plan__how">
                        <summary>Как делать</summary>
                        {ex.how ? <p>{ex.how}</p> : null}
                        {ex.tip ? <p className="client-plan__tip">{ex.tip}</p> : null}
                      </details>
                    ) : null}
                  </span>
                  <span className="client-plan__chip">
                    {ex.sets} × {ex.reps || '—'}
                    {ex.rest_sec > 0 ? <small> · отдых {ex.rest_sec} с</small> : null}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}

/** Питание: итог выбранного дня крупно, затем приёмы. Неделя — кнопки дней, один день — без них. */
export function ClientNutritionView({ item }) {
  const p = item.payload
  const [dayIndex, setDayIndex] = useState(0)
  const daysRef = useRef(null)
  const planId = item?.id
  useEffect(() => {
    setDayIndex(0)
  }, [planId])
  const day = clientNutritionDayView(p, dayIndex)
  const pickDay = (index, el) => {
    setDayIndex(index)
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    daysRef.current?.scrollIntoView({ block: 'start', behavior })
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior })
  }
  return (
    <section className="client-me-card client-plan">
      <Head item={item} title={p.goal ? `Рацион · ${p.goal}` : day.tabs.length ? 'Рацион' : 'Рацион на день'} />
      {day.tabs.length > 1 ? (
        <div className="client-plan__days-wrap" ref={daysRef}>
          <div className="client-plan__days" role="group" aria-label="Дни рациона">
            {day.tabs.map((d) => (
              <button
                key={d.index}
                type="button"
                className="client-plan__day"
                aria-pressed={d.index === day.index}
                aria-label={d.spoken}
                onClick={(e) => pickDay(d.index, e.currentTarget)}
              >
                {d.short}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="client-plan__totals" aria-live="polite">
        <span className="client-plan__kcal">
          {fmt(day.totals.kcal)}
          <small>{day.spoken ? 'ккал' : 'ккал в день'}</small>
        </span>
        {day.spoken ? <p className="client-plan__day-now">{day.spoken}</p> : null}
        <span className="client-plan__macros">
          <span>
            <strong>{fmt(day.totals.proteinG)}</strong> белки
          </span>
          <span>
            <strong>{fmt(day.totals.fatG)}</strong> жиры
          </span>
          <span>
            <strong>{fmt(day.totals.carbsG)}</strong> углев.
          </span>
        </span>
      </div>
      {day.meals.map((m, mi) => (
        <div key={`${day.index}-${m.label}-${mi}`} className="client-plan__block">
          <h3 className="client-plan__block-title client-plan__meal-title">
            {m.label}
            <small>{fmt(m.subtotal.kcal)} ккал</small>
          </h3>
          <ul className="client-plan__list">
            {m.items.map((it, i) => (
              <li key={`${it.label}-${i}`} className="client-plan__row client-plan__row--food">
                <span className="client-plan__name">
                  {it.label}
                  {it.portion ? <small>{it.portion}</small> : null}
                </span>
                <span className="client-plan__chip">
                  {it.grams != null ? `${fmt(it.grams)} г` : ''}
                  <small> · {fmt(it.kcal)} ккал</small>
                </span>
              </li>
            ))}
          </ul>
          {Array.isArray(m.steps) && m.steps.length > 0 ? (
            <details className="client-plan__recipe">
              <summary>Как приготовить</summary>
              <ol className="client-plan__recipe-steps">
                {m.steps.map((step, si) => (
                  <li key={si}>{step}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ))}
      {p.disclaimer ? <p className="client-me-muted client-plan__disclaimer">{p.disclaimer}</p> : null}
    </section>
  )
}
