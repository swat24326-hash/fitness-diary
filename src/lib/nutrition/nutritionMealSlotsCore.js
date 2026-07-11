/**
 * Слоты приёмов пищи и доли суточных ккал.
 * @param {number} mealsPerDay
 */
export function getMealSlots(mealsPerDay) {
  const n = Number(mealsPerDay)
  if (n === 3) {
    return [
      { id: 'breakfast', label: 'Завтрак', ratio: 0.25 },
      { id: 'lunch', label: 'Обед', ratio: 0.4 },
      { id: 'dinner', label: 'Ужин', ratio: 0.35 },
    ]
  }
  if (n === 4) {
    return [
      { id: 'breakfast', label: 'Завтрак', ratio: 0.25 },
      { id: 'snack_am', label: 'Перекус', ratio: 0.1 },
      { id: 'lunch', label: 'Обед', ratio: 0.35 },
      { id: 'dinner', label: 'Ужин', ratio: 0.3 },
    ]
  }
  if (n === 5) {
    return [
      { id: 'breakfast', label: 'Завтрак', ratio: 0.2 },
      { id: 'snack_am', label: 'Перекус', ratio: 0.1 },
      { id: 'lunch', label: 'Обед', ratio: 0.3 },
      { id: 'snack_pm', label: 'Полдник', ratio: 0.1 },
      { id: 'dinner', label: 'Ужин', ratio: 0.3 },
    ]
  }
  return [
    { id: 'breakfast', label: 'Завтрак', ratio: 0.2 },
    { id: 'snack_am', label: 'Перекус 1', ratio: 0.1 },
    { id: 'lunch', label: 'Обед', ratio: 0.25 },
    { id: 'snack_pm', label: 'Перекус 2', ratio: 0.1 },
    { id: 'dinner', label: 'Ужин', ratio: 0.25 },
    { id: 'snack_evening', label: 'Перекус 3', ratio: 0.1 },
  ]
}

export function mealSlotsRatiosSum(mealsPerDay) {
  const slots = getMealSlots(mealsPerDay)
  return slots.reduce((s, x) => s + x.ratio, 0)
}
