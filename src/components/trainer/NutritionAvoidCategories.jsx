/**
 * «Не ем» по пищевым категориям (молочка, мясо, рыба…) — раскрывается список продуктов.
 */
import { useMemo } from 'react'
import {
  NUTRITION_FOOD_CATEGORIES,
  foodCategoryAvoidStats,
  listCatalogProductsByFoodCategory,
  setCategoryAvoided,
} from '../../lib/nutrition/nutritionFoodCategoriesCore.js'

function AvoidChips({ products, avoided, exclusions, onToggle, readOnly, locked }) {
  const avoid = new Set(avoided ?? [])
  const ex = new Set(exclusions ?? [])
  return (
    <div className="nutrition-chips">
      {products.map((p) => {
        const blocked = p.tags?.some((t) => ex.has(t))
        const off = avoid.has(p.id)
        return (
          <button
            key={p.id}
            type="button"
            className={`nutrition-chip${off ? ' nutrition-chip--avoid' : ''}${blocked ? ' nutrition-chip--blocked' : ''}`}
            disabled={readOnly || locked || blocked}
            title={
              blocked
                ? 'Уже снято ограничением (лактоза/глютен)'
                : off
                  ? 'Не ест — нажмите, чтобы вернуть'
                  : 'Ест — нажмите, если не ест'
            }
            aria-pressed={off}
            onClick={() => onToggle(p.id)}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export function NutritionAvoidCategories({
  avoided = [],
  exclusions = [],
  catalogMap,
  onChangeAvoidIds,
  readOnly = false,
  locked = false,
}) {
  const categories = useMemo(() => {
    return NUTRITION_FOOD_CATEGORIES.map((cat) => {
      const products = listCatalogProductsByFoodCategory(catalogMap, cat.id)
      const stats = foodCategoryAvoidStats({
        categoryId: cat.id,
        avoidProductIds: avoided,
        exclusions,
        catalogMap,
      })
      return { ...cat, products, stats }
    }).filter((c) => c.products.length > 0)
  }, [catalogMap, avoided, exclusions])

  return (
    <div className="nutrition-avoid-cats">
      {categories.map((cat) => {
        const { stats } = cat
        const status =
          stats.toggleableIds.length === 0
            ? 'нет в справочнике'
            : stats.allAvoided
              ? 'всё исключено'
              : stats.avoided > 0
                ? `не ест: ${stats.avoided}`
                : 'ест всё'
        return (
          <details key={cat.id} className="nutrition-avoid-cat">
            <summary className="nutrition-avoid-cat__summary">
              <span className="nutrition-avoid-cat__title">{cat.label}</span>
              <span className="nutrition-avoid-cat__meta muted">{status}</span>
            </summary>
            <p className="nutrition-avoid-cat__hint muted">{cat.hint}</p>
            {stats.toggleableIds.length > 0 && !readOnly && !locked ? (
              <div className="nutrition-avoid-cat__bulk">
                <button
                  type="button"
                  className="btn btn-sm btn-touch btn-ghost"
                  disabled={stats.allAvoided}
                  onClick={() => onChangeAvoidIds(setCategoryAvoided(avoided, stats.toggleableIds, true))}
                >
                  Не ем всё
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-touch btn-ghost"
                  disabled={stats.avoided === 0}
                  onClick={() => onChangeAvoidIds(setCategoryAvoided(avoided, stats.toggleableIds, false))}
                >
                  Вернуть всё
                </button>
              </div>
            ) : null}
            <AvoidChips
              products={cat.products}
              avoided={avoided}
              exclusions={exclusions}
              readOnly={readOnly}
              locked={locked}
              onToggle={(id) => {
                const set = new Set(avoided.map(String))
                if (set.has(id)) set.delete(id)
                else set.add(id)
                onChangeAvoidIds([...set])
              }}
            />
          </details>
        )
      })}
    </div>
  )
}
