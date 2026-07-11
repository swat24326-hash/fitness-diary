import { Download, Share2 } from 'lucide-react'
import { getHealthCurrentWeightKg } from '../../lib/clientWeightCore'
import { NutritionTableBlock } from './NutritionTableBlock.jsx'

function mapSummaryRow(row) {
  return {
    key: row.productId,
    productId: row.productId,
    label: row.label,
    portionLabel: row.portionLabel,
    grams: row.grams,
    kcal: row.kcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
  }
}

function mapMealItem(meal, item) {
  return {
    key: `${meal.slot}-${item.productId}`,
    productId: item.productId,
    label: item.label,
    portionLabel: item.portionLabel,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.proteinG,
    fatG: item.fatG,
    carbsG: item.carbsG,
  }
}

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
          <h2 className="section-title nutrition-client-title">{client.name}</h2>
          <p className="nutrition-client-meta muted">
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
            <p className="nutrition-referents">
              Референты: ккал <strong>{displayPlan.referents.kcal.min}–{displayPlan.referents.kcal.max}</strong>
              {' '}(цель ~{displayPlan.referents.kcal.aim}) · Б{' '}
              <strong>{displayPlan.referents.protein.min}–{displayPlan.referents.protein.max}</strong> г · Ж{' '}
              <strong>{displayPlan.referents.fat.min}–{displayPlan.referents.fat.max}</strong> г · У{' '}
              <strong>{displayPlan.referents.carbs.min}–{displayPlan.referents.carbs.max}</strong> г
            </p>
          ) : null}
          <p className="nutrition-fact-line">
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
            <p className="muted nutrition-edit-hint">Можно подправить граммы — изменения попадут в черновик до сохранения.</p>
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
            <NutritionTableBlock
              rows={daySummary.map(mapSummaryRow)}
              portionHeader="Всего"
              tableClassName="nutrition-table--summary"
            />
          </article>
        ) : null}

        <div className="nutrition-day-table">
          {displayPlan.dayPlan.map((meal) => (
            <article key={meal.slot} className="nutrition-meal-block">
              <h3 className="nutrition-meal-title">{meal.label}</h3>
              <NutritionTableBlock
                rows={meal.items.map((item) => mapMealItem(meal, item))}
                footer={{
                  label: 'Подытог',
                  kcal: meal.subtotal.kcal,
                  proteinG: meal.subtotal.proteinG,
                  fatG: meal.subtotal.fatG,
                  carbsG: meal.subtotal.carbsG,
                }}
                readOnly={readOnly}
                planUnsaved={planUnsaved}
                mealSlot={meal.slot}
                onItemGramsChange={onItemGramsChange}
              />
            </article>
          ))}
        </div>

        <div className="nutrition-totals-card" role="status">
          <strong>Итого за день:</strong> {displayPlan.totals.kcal} ккал (референт ~{displayPlan.kcalTarget}) · Б{' '}
          {displayPlan.totals.proteinG} · Ж {displayPlan.totals.fatG} · У {displayPlan.totals.carbsG}
        </div>
        <p className="nutrition-plan-disclaimer muted">{displayPlan.disclaimer}</p>
      </div>
    </>
  )
}
