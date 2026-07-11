import { Download, Share2 } from 'lucide-react'
import { getHealthCurrentWeightKg } from '../../lib/clientWeightCore'

export function NutritionPlanDisplay({
  client,
  health,
  displayPlan,
  planUnsaved,
  generatedAt,
  goalKindLabel,
  referentCheck,
  daySummary,
  readOnly,
  exportBusy,
  onExport,
  onItemGramsChange,
  hasPendingChanges,
  draftAligned,
  onDiscard,
  busy,
  formatDateRu,
}) {
  if (!displayPlan) return null

  return (
    <>
      <div className="nutrition-result-header">
        <div className="nutrition-result-header__main">
          <p className="nutrition-plan-brand">FIT-CITY · мерный рацион</p>
          <h2 className="section-title nutrition-client-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            {client.name}
          </h2>
          <p className="nutrition-client-meta muted" style={{ margin: '6px 0 0' }}>
            Вес <strong>{getHealthCurrentWeightKg(health) ?? '—'}</strong> кг
            {health?.goal ? (
              <>
                {' '}
                · Цель: <strong>{health.goal}</strong>
              </>
            ) : null}
            {goalKindLabel ? (
              <>
                {' '}
                · Питание: <strong>{goalKindLabel}</strong>
              </>
            ) : null}
            {generatedAt && !planUnsaved ? ` · сохранён ${formatDateRu(generatedAt.slice(0, 10))}` : null}
          </p>
          {displayPlan.referents ? (
            <p className="nutrition-referents" style={{ margin: '8px 0 0', fontSize: 13 }}>
              Референты: ккал <strong>{displayPlan.referents.kcal.min}–{displayPlan.referents.kcal.max}</strong>
              {' '}(цель ~{displayPlan.referents.kcal.aim}) · Б{' '}
              <strong>{displayPlan.referents.protein.min}–{displayPlan.referents.protein.max}</strong> г · Ж{' '}
              <strong>{displayPlan.referents.fat.min}–{displayPlan.referents.fat.max}</strong> г · У{' '}
              <strong>{displayPlan.referents.carbs.min}–{displayPlan.referents.carbs.max}</strong> г
            </p>
          ) : null}
          <p className="nutrition-fact-line" style={{ margin: '8px 0 0' }}>
            Факт: <strong>{displayPlan.totals?.kcal ?? '—'}</strong> ккал · Б {displayPlan.totals?.proteinG} · Ж{' '}
            {displayPlan.totals?.fatG} · У {displayPlan.totals?.carbsG}
            {referentCheck ? (
              <span className="nutrition-referent-status">
                {' '}
                · в референтах: ккал {referentCheck.kcal ? '✓' : '—'} · Б {referentCheck.protein ? '✓' : '—'} · Ж{' '}
                {referentCheck.fat ? '✓' : '—'} · У {referentCheck.carbs ? '✓' : '—'}
              </span>
            ) : null}
          </p>
          {hasPendingChanges ? (
            <p className="nutrition-unsaved-banner" role="status">
              {planUnsaved && !draftAligned
                ? 'Ответы изменились — пересоберите рацион, иначе сохранение недоступно.'
                : planUnsaved
                  ? 'Черновик рациона — сохраните или отмените.'
                  : 'Ответы изменены — пересоберите рацион или отмените.'}
              {!readOnly && onDiscard ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost nutrition-unsaved-banner__btn"
                  disabled={busy}
                  onClick={() => void onDiscard()}
                >
                  Отменить
                </button>
              ) : null}
            </p>
          ) : null}
          {!readOnly && planUnsaved ? (
            <p className="muted nutrition-edit-hint" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Можно подправить граммы — изменения попадут в черновик до сохранения.
            </p>
          ) : null}
        </div>
        <div className="nutrition-result-actions">
          <button type="button" className="btn btn-touch" disabled={exportBusy || planUnsaved} onClick={() => void onExport()}>
            <Share2 size={18} aria-hidden />
            Поделиться / PNG
          </button>
          <button type="button" className="btn btn-touch btn-ghost" disabled={exportBusy || planUnsaved} onClick={() => void onExport()}>
            <Download size={18} aria-hidden />
            Скачать
          </button>
        </div>
      </div>

      <div className="nutrition-plan-body">
      {daySummary.length > 0 ? (
        <article className="nutrition-meal-block nutrition-day-summary">
          <h3 className="nutrition-meal-title">Сводка на день</h3>
          <table className="nutrition-table nutrition-table--summary">
            <thead>
              <tr>
                <th>Продукт</th>
                <th>Всего</th>
                <th>ккал</th>
                <th>Б</th>
                <th>Ж</th>
                <th>У</th>
              </tr>
            </thead>
            <tbody>
              {daySummary.map((row) => (
                <tr key={row.productId}>
                  <td>{row.label}</td>
                  <td>{row.portionLabel}</td>
                  <td>{row.kcal}</td>
                  <td>{row.proteinG}</td>
                  <td>{row.fatG}</td>
                  <td>{row.carbsG}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : null}

      <div className="nutrition-day-table">
        {displayPlan.dayPlan.map((meal) => (
          <article key={meal.slot} className="nutrition-meal-block">
            <h3 className="nutrition-meal-title">{meal.label}</h3>
            <table className="nutrition-table">
              <thead>
                <tr>
                  <th>Продукт</th>
                  <th>Порция</th>
                  <th>ккал</th>
                  <th>Б</th>
                  <th>Ж</th>
                  <th>У</th>
                </tr>
              </thead>
              <tbody>
                {meal.items.map((item) => (
                  <tr key={`${meal.slot}-${item.productId}`}>
                    <td>{item.label}</td>
                    <td>
                      {readOnly || !planUnsaved ? (
                        item.portionLabel
                      ) : (
                        <label className="nutrition-grams-edit">
                          <input
                            className="input nutrition-grams-input"
                            type="number"
                            min={5}
                            step={5}
                            inputMode="decimal"
                            defaultValue={item.grams ?? ''}
                            key={`${meal.slot}-${item.productId}-${item.grams}`}
                            onBlur={(e) => onItemGramsChange(meal.slot, item.productId, e.target.value)}
                          />
                          <span className="muted">г</span>
                        </label>
                      )}
                    </td>
                    <td>{item.kcal}</td>
                    <td>{item.proteinG}</td>
                    <td>{item.fatG}</td>
                    <td>{item.carbsG}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>Подытог</strong>
                  </td>
                  <td>{meal.subtotal.kcal}</td>
                  <td>{meal.subtotal.proteinG}</td>
                  <td>{meal.subtotal.fatG}</td>
                  <td>{meal.subtotal.carbsG}</td>
                </tr>
              </tfoot>
            </table>
          </article>
        ))}
      </div>

      <div className="nutrition-totals-card" role="status">
        <strong>Итого за день:</strong> {displayPlan.totals.kcal} ккал (референт ~{displayPlan.kcalTarget}) · Б{' '}
        {displayPlan.totals.proteinG} · Ж {displayPlan.totals.fatG} · У {displayPlan.totals.carbsG}
      </div>
      <p className="nutrition-plan-disclaimer muted">
        {displayPlan.disclaimer}
      </p>
      </div>
    </>
  )
}
