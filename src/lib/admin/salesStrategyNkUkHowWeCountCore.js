/**
 * Тексты «как считаем» для Стратегии (утверждение НК/УК по залам).
 */

/**
 * @param {{ planExtraPct?: number, budgetTolerance?: number } | null | undefined} pack
 */
export function strategyNkUkHowWeCountRu(pack) {
  const extraPct = Number(pack?.planExtraPct) || 70
  const tol = Number(pack?.budgetTolerance)
  const tolRub = Number.isFinite(tol) && tol >= 0 ? tol : 15000
  const tolLabel = new Intl.NumberFormat('ru-RU').format(Math.round(tolRub))

  return {
    title: 'Как считаем пакет по направлениям ПЗ · ТЗ · АЗ',
    steps: [
      'Ур. 3 — потолок месяца. Доп. продажи = ' +
        extraPct +
        '% от доп. прошлого месяца. Бюджет залов = ур. 3 − доп.',
      'ДК по каждому залу — из закрытий × % продления (шапка). Чек ДК — из истории покупок или прайса. ДК здесь не редактируем.',
      'Остаток (бюджет залов − Σ ДК) делим на ПЗ / ТЗ / АЗ по доле выручки зала за прошлый месяц. Внутри зала — НК и УК по их доле ₽.',
      'Штуки НК/УК = сумма ÷ ср. чек прошлого месяца (по залу). Их можно поправить вручную: ₽ = шт × чек.',
      'Итого зала = НК + ДК + УК. Пакет = сумма трёх залов. Сверка с бюджетом залов, допуск сверху +' +
        tolLabel +
        ' ₽.',
    ],
  }
}
