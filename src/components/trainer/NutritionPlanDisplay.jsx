import { RefreshCw, Send, Share2 } from 'lucide-react'
import { getHealthCurrentWeightKg } from '../../lib/clientWeightCore'
import { NutritionTableBlock } from './NutritionTableBlock.jsx'
import { NutritionMealRecipeBlock } from './NutritionMealRecipeBlock.jsx'
import { ClientPlanAppButton, ClientPlanAppStatus } from './ClientPlanAppButton.jsx'

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
  exportStatus = '',
  onExportMax,
  onExportOther,
  onItemGramsChange,
  onSwapMeal,
  onSelectDay,
  activeDayIndex = 0,
  hasPendingChanges,
  draftAligned,
  onDiscard,
  busy,
  formatDateRu,
  clubName = '',
  app = null,
  onSendApp,
}) {
  if (!displayPlan) return null

  const brandClub = String(clubName ?? '').trim()
  const canSend = !exportBusy && !planUnsaved && !readOnly
  const weekDays = Array.isArray(displayPlan.days) ? displayPlan.days : null
  const activeDayLabel = weekDays?.find((d) => d.dayIndex === activeDayIndex)?.label ?? 'Пн'
  const refs = displayPlan.referents
  const kpiItems = [
    {
      key: 'kcal',
      label: 'ккал',
      value: displayPlan.totals?.kcal ?? '—',
      ref: refs ? `цель ~${refs.kcal.aim}` : displayPlan.kcalTarget ? `~${displayPlan.kcalTarget}` : null,
      ok: referentCheck?.kcal,
    },
    {
      key: 'p',
      label: 'Б',
      value: displayPlan.totals?.proteinG ?? '—',
      ref: refs ? `${refs.protein.min}–${refs.protein.max}` : null,
      ok: referentCheck?.protein,
    },
    {
      key: 'f',
      label: 'Ж',
      value: displayPlan.totals?.fatG ?? '—',
      ref: refs ? `${refs.fat.min}–${refs.fat.max}` : null,
      ok: referentCheck?.fat,
    },
    {
      key: 'c',
      label: 'У',
      value: displayPlan.totals?.carbsG ?? '—',
      ref: refs ? `${refs.carbs.min}–${refs.carbs.max}` : null,
      ok: referentCheck?.carbs,
    },
  ]

  return (
    <>
      <div className="nutrition-result-header nutrition-result-header--plate">
        <div className="nutrition-result-header__main">
          <p className="nutrition-plan-brand">
            {brandClub ? `${brandClub} · мерный рацион` : 'Мерный рацион'}
          </p>
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
          <div className="nutrition-kpi" role="group" aria-label="КБЖУ дня">
            {kpiItems.map((item) => (
              <div
                key={item.key}
                className={`nutrition-kpi__chip${
                  item.ok === true ? ' nutrition-kpi__chip--ok' : item.ok === false ? ' nutrition-kpi__chip--off' : ''
                }`}
              >
                <span className="nutrition-kpi__label">{item.label}</span>
                <span className="nutrition-kpi__value">{item.value}</span>
                {item.ref ? <span className="nutrition-kpi__ref">{item.ref}</span> : null}
              </div>
            ))}
          </div>
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
                  className="btn btn-touch btn-ghost nutrition-unsaved-banner__btn"
                  disabled={busy}
                  onClick={() => void onDiscard()}
                >
                  Отменить
                </button>
              ) : null}
            </p>
          ) : null}
          {!readOnly && planUnsaved ? (
            <p className="muted nutrition-edit-hint">Меняйте граммы в блюдах — черновик обновится до сохранения.</p>
          ) : null}
        </div>
      </div>

      <div className="nutrition-plan-body">
        {weekDays && weekDays.length > 1 ? (
          <div className="nutrition-week-bar">
            <p className="nutrition-week-hint" role="status">
              <strong>{weekDays.length} дн.</strong> · сейчас <strong>{activeDayLabel}</strong> — у каждого дня свои блюда
            </p>
            <div className="nutrition-week-days" role="tablist" aria-label="Дни рациона">
              {weekDays.map((d) => (
                <button
                  key={d.dayIndex}
                  type="button"
                  role="tab"
                  aria-selected={activeDayIndex === d.dayIndex}
                  className={`btn nutrition-week-day${activeDayIndex === d.dayIndex ? ' nutrition-week-day--active' : ' btn-ghost'}`}
                  disabled={readOnly && !onSelectDay}
                  onClick={() => onSelectDay?.(d.dayIndex)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {daySummary.length > 0 ? (
          <details className="nutrition-meal-block nutrition-day-summary">
            <summary className="nutrition-day-summary__toggle">
              <h3 className="nutrition-meal-title">
                Сводка продуктов
                {weekDays?.length > 1 ? ` · ${activeDayLabel}` : ''}
              </h3>
            </summary>
            <div className="nutrition-day-summary__body">
              <NutritionTableBlock
                rows={daySummary.map(mapSummaryRow)}
                portionHeader="Всего"
                tableClassName="nutrition-table--summary"
              />
            </div>
          </details>
        ) : null}

        <div className="nutrition-day-table">
          {displayPlan.dayPlan.map((meal) => (
            <article
              key={meal.slot}
              className={`nutrition-meal-block${meal.prep === 'recipe' || meal.source === 'recipe' ? ' nutrition-meal-block--recipe' : ' nutrition-meal-block--base'}`}
            >
              <header className="nutrition-meal-block__head">
                <div className="nutrition-meal-block__title-row">
                  <h3 className="nutrition-meal-title">
                    <span className="nutrition-meal-title__slot">{meal.label}</span>
                    {meal.dishLabel ? (
                      <span className="nutrition-meal-title__dish">{meal.dishLabel}</span>
                    ) : null}
                  </h3>
                  {!readOnly && onSwapMeal ? (
                    <button
                      type="button"
                      className="btn btn-touch btn-ghost nutrition-meal-swap"
                      disabled={busy}
                      title="Другое блюдо в этом приёме"
                      onClick={() => onSwapMeal(meal.slot)}
                    >
                      <RefreshCw size={16} aria-hidden />
                      Другое блюдо
                    </button>
                  ) : null}
                </div>
                <NutritionMealRecipeBlock meal={meal} />
              </header>
              <NutritionTableBlock
                rows={meal.items.map((item) => mapMealItem(meal, item))}
                footer={{
                  label: 'КБЖУ',
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

        <p className="nutrition-plan-disclaimer muted">{displayPlan.disclaimer}</p>
      </div>

      {!readOnly ? (
        <div
          className={`nutrition-share-actions${planUnsaved ? '' : ' homework-preview__actions--sticky'}`}
        >
          <div className="homework-preview__send-row">
            <button
              type="button"
              className={`btn btn-touch${planUnsaved ? ' btn-ghost' : ' homework-preview__send'}`}
              disabled={!canSend}
              onClick={() => void onExportMax?.()}
            >
              <Send size={18} aria-hidden />
              {exportBusy ? 'Готовим…' : 'В Max'}
            </button>
            <button
              type="button"
              className="btn btn-touch btn-ghost homework-preview__send-other"
              disabled={!canSend}
              onClick={() => void onExportOther?.()}
            >
              <Share2 size={18} aria-hidden />
              Другой мессенджер
            </button>
            <ClientPlanAppButton app={app} disabled={!canSend} onClick={onSendApp} />
          </div>
          <ClientPlanAppStatus app={app} />
          {planUnsaved ? (
            <p className="muted nutrition-share-actions__hint">Сначала сохраните рацион — затем отправка.</p>
          ) : exportStatus ? (
            <p className="muted nutrition-share-actions__hint" role="status">
              {exportStatus}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
