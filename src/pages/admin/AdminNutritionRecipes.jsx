import { useMemo, useState } from 'react'
import { NUTRITION_RECIPE_CATALOG } from '../../lib/nutrition/nutritionRecipeCatalog.js'
import { getNutritionProductById } from '../../lib/nutrition/nutritionProductCatalog.js'

const SLOT_LABEL = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}

const SLOT_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'snack', label: 'Перекус' },
  { id: 'lunch', label: 'Обед / ужин' },
]

function partLabel(productKey) {
  return getNutritionProductById(productKey)?.label ?? productKey
}

function RecipeCard({ recipe, open, onToggle }) {
  const slots = recipe.slotKinds.map((k) => SLOT_LABEL[k] ?? k).join(' · ')
  return (
    <li className={`admin-nutrition-recipe ${open ? 'admin-nutrition-recipe--open' : ''}`}>
      <button type="button" className="admin-nutrition-recipe__head" onClick={onToggle} aria-expanded={open}>
        <span className="admin-nutrition-recipe__title">{recipe.label}</span>
        <span className="muted admin-nutrition-recipe__slots">{slots}</span>
      </button>
      {open ? (
        <div className="admin-nutrition-recipe__body">
          <p className="admin-nutrition-recipe__parts-label">Ингредиенты</p>
          <ul className="admin-nutrition-recipe__parts">
            {recipe.parts.map((p) => (
              <li key={p.productKey}>
                {partLabel(p.productKey)}
                {p.optional ? <span className="muted"> (по желанию)</span> : null}
              </li>
            ))}
          </ul>
          <p className="admin-nutrition-recipe__parts-label">Как приготовить</p>
          <ol className="admin-nutrition-recipe__steps">
            {recipe.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Книга рецептов — пока только просмотр (каталог в коде).
 * Редактирование / CRUD в БД — следующий шаг, когда понадобится свой набор клуба.
 */
export function AdminNutritionRecipes() {
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)

  const list = useMemo(() => {
    if (filter === 'all') return NUTRITION_RECIPE_CATALOG
    if (filter === 'lunch') {
      return NUTRITION_RECIPE_CATALOG.filter((r) => r.slotKinds.includes('lunch') || r.slotKinds.includes('dinner'))
    }
    return NUTRITION_RECIPE_CATALOG.filter((r) => r.slotKinds.includes(filter))
  }, [filter])

  return (
    <div className="admin-nutrition-page admin-nutrition-recipes-page">
      <section className="card admin-nutrition-hero">
        <div className="admin-nutrition-hero__text">
          <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            Книга рецептов
          </h2>
          <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
            Общий набор блюд для сборки рациона (Пятёрочка / Магнит, домашняя кухня). Пока только просмотр —
            правки в коде. Продукты клуба — во вкладке «Питание».
          </p>
          <p className="admin-nutrition-hero__stat">
            Рецептов: <strong>{NUTRITION_RECIPE_CATALOG.length}</strong>
            {filter !== 'all' ? (
              <>
                {' '}
                · показано: <strong>{list.length}</strong>
              </>
            ) : null}
          </p>
        </div>
      </section>

      <div className="admin-nutrition-recipes-filters" role="tablist" aria-label="Фильтр по приёму пищи">
        {SLOT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`btn btn-sm ${filter === f.id ? '' : 'btn-ghost'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="card admin-nutrition-recipes-list-card">
        <ul className="admin-nutrition-recipes-list">
          {list.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              open={openId === r.id}
              onToggle={() => setOpenId((id) => (id === r.id ? null : r.id))}
            />
          ))}
        </ul>
        {!list.length ? <p className="muted">Нет рецептов в этом фильтре.</p> : null}
      </section>
    </div>
  )
}
