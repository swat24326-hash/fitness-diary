/** Заполнение формы тренировки так, как это делает тренер (все обязательные вкладки). */

async function openTab(page, name) {
  await page.getByRole('tablist').getByRole('button', { name, exact: true }).click()
}

export async function pickCatalogExercise(page, query, fullName) {
  const input = page.getByRole('textbox', { name: 'Упражнение: поиск по справочнику' }).first()
  await input.fill(query)
  await page.getByRole('option', { name: fullName }).first().click()
}

export async function fillTrainingForCompletion(page) {
  await page.getByRole('spinbutton', { name: 'Вес до тренировки, кг' }).fill('62')
  await page.locator('.field', { hasText: 'Направленность тренировки' }).locator('input').fill('Сила')

  await openTab(page, '1. Опрос')
  await page.getByRole('button', { name: '🙂' }).click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  const survey = page.getByRole('spinbutton')
  await survey.nth(1).fill('8')
  await survey.nth(2).fill('2')

  await openTab(page, '2. Разминка')
  await page.getByRole('textbox', { name: 'Суставная гимнастика, лёгкий кардио…' }).fill('Суставная гимнастика')
  await page.getByRole('spinbutton').nth(1).fill('10')

  await openTab(page, '3. Упражнения')
  await pickCatalogExercise(page, 'Жим', 'Жим лёжа')
  await page.getByRole('textbox', { name: 'Повторы' }).first().fill('10')
  await page.getByRole('textbox', { name: 'Вес, кг' }).first().fill('40')

  await openTab(page, '4. Заминка')
  await page.locator('main textarea').first().fill('Растяжка')
  await page.getByRole('spinbutton').nth(1).fill('5')

  await openTab(page, '5. Итог')
  await page.getByRole('button', { name: '5 звёзд' }).click()
}
