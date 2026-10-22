/**
 * DEV: рацион на 7 дней без входа — чтобы смотреть кнопки дней на телефоне.
 * /me/nutrition-preview
 */
import { Navigate } from 'react-router-dom'
import { ClientNutritionView } from './ClientPlanViews.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function meal(slot, food, kcal) {
  return {
    label: slot,
    items: [
      { label: food, portion: '150 г', grams: 150, kcal, proteinG: 25, fatG: 8, carbsG: 20 },
      { label: 'Овощи', portion: '100 г', grams: 100, kcal: 40, proteinG: 2, fatG: 0, carbsG: 8 },
    ],
    subtotal: { kcal: kcal + 40, proteinG: 27, fatG: 8, carbsG: 28 },
    steps: ['Нарезать', 'Прогреть на сковороде 8 минут'],
  }
}

const SLOTS = [
  ['Завтрак', 'Овсянка с ягодами'],
  ['Обед', 'Курица с гречкой'],
  ['Ужин', 'Рыба с овощами'],
]

function dayMeals(index) {
  return SLOTS.map(([slot, food], i) => meal(`${slot}`, `${food} · ${WEEK[index]}`, 280 + index * 10 + i * 40))
}

const item = {
  id: 'preview-nutrition-week',
  sent_at: '2026-10-23T08:00:00.000Z',
  trainer_name: 'Дмитрий',
  payload: {
    goal: 'Снижение веса',
    disclaimer: 'Ориентировочный рацион, не медицинское назначение.',
    totals: { kcal: 1800, proteinG: 120, fatG: 55, carbsG: 170 },
    meals: dayMeals(0),
    days: WEEK.map((label, index) => ({
      label,
      totals: { kcal: 1800 + index * 15, proteinG: 120, fatG: 55, carbsG: 170 },
      meals: dayMeals(index),
    })),
  },
}

export function ClientNutritionPreviewPage() {
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  return (
    <ClientMeShell tabs club={{ name: 'FIT-CITY' }}>
      <ClientPageTitle title="От тренера" back={false} />
      <ClientNutritionView item={item} />
    </ClientMeShell>
  )
}
