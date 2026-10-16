/**
 * Подпись к приёму: «Рецепт» (готовить) или «База» (рис/курица/творог).
 * Крупная зона тапа на summary — под планшет.
 */
export function NutritionMealRecipeBlock({ meal }) {
  if (!meal) return null
  const steps = Array.isArray(meal.recipeSteps) ? meal.recipeSteps.filter(Boolean) : []
  const isRecipe = meal.prep === 'recipe' || meal.source === 'recipe'

  if (!isRecipe) {
    if (!steps.length) {
      return (
        <p className="nutrition-meal-mode nutrition-meal-mode--base" title="Простая база без пошагового рецепта">
          База
        </p>
      )
    }
    return (
      <details className="nutrition-recipe nutrition-recipe--base">
        <summary className="nutrition-recipe__summary">
          <span className="nutrition-recipe__badge nutrition-recipe__badge--base">База</span>
          <span className="nutrition-recipe__hint">Как приготовить</span>
        </summary>
        <ol className="nutrition-recipe__steps">
          {steps.map((step, i) => (
            <li key={`${meal.slot}-${i}`}>{step}</li>
          ))}
        </ol>
      </details>
    )
  }

  if (!steps.length) {
    return (
      <p className="nutrition-meal-mode nutrition-meal-mode--recipe" title="Именное блюдо из книги рецептов">
        Рецепт
      </p>
    )
  }

  return (
    <details className="nutrition-recipe">
      <summary className="nutrition-recipe__summary">
        <span className="nutrition-recipe__badge">Рецепт</span>
        <span className="nutrition-recipe__hint">Как приготовить</span>
      </summary>
      <ol className="nutrition-recipe__steps">
        {steps.map((step, i) => (
          <li key={`${meal.slot}-${i}`}>{step}</li>
        ))}
      </ol>
    </details>
  )
}
