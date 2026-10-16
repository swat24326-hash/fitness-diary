/**
 * Подпись к приёму: рецепт со шагами (раскрывается) или простая тарелка.
 * Крупная зона тапа на summary — под планшет.
 */
export function NutritionMealRecipeBlock({ meal }) {
  if (!meal) return null
  const steps = Array.isArray(meal.recipeSteps) ? meal.recipeSteps.filter(Boolean) : []
  const isRecipe = meal.source === 'recipe' || Boolean(meal.recipeId) || steps.length > 0

  if (!isRecipe) {
    return (
      <p className="nutrition-meal-mode muted" title="Продукты без пошагового рецепта">
        Простая тарелка
      </p>
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
