/**
 * Книга рецептов — домашняя кухня Центральной России + популярные ПП-идеи.
 * Продукты: полка «Пятёрочки» и «Магнита».
 *
 * Техника (по приоритету в шагах):
 * 1) плита, сковорода, духовка — есть почти у всех;
 * 2) блендер — тоже часто есть, ок для кремов/паштета;
 * 3) аэрогриль — посередине по популярности: только как «можно ещё…», не основной путь.
 *
 * Без обязательного авокадо, арахисовой пасты и лосося.
 *
 * Ингредиенты — ключи builtin-каталога; при сборке резолвятся в пул клиента по id или названию.
 *
 * @typedef {object} NutritionRecipePart
 * @property {string} productKey — id из nutritionProductCatalog
 * @property {number} share
 * @property {boolean} [optional]
 *
 * @typedef {object} NutritionRecipe
 * @property {string} id
 * @property {string} label
 * @property {string[]} slotKinds breakfast|lunch|dinner|snack
 * @property {string[]} steps
 * @property {NutritionRecipePart[]} parts
 */

/** @type {NutritionRecipe[]} */
export const NUTRITION_RECIPE_CATALOG = [
  // —— Завтрак ——
  {
    id: 'oats_cottage_berries',
    label: 'Овсянка с творогом',
    slotKinds: ['breakfast'],
    steps: [
      'Овсянку залейте кипятком, накройте на 5–7 мин (как «геркулес» из пачки).',
      'Вмешайте творог вилкой; блендером — если хотите глаже.',
      'Сверху ягоды из заморозки или свежие.',
    ],
    parts: [
      { productKey: 'oats', share: 0.3 },
      { productKey: 'cottage_cheese_5', share: 0.45 },
      { productKey: 'berries', share: 0.15, optional: true },
      { productKey: 'nuts_walnut', share: 0.1, optional: true },
    ],
  },
  {
    id: 'eggs_veg_toast',
    label: 'Яичница с овощами и хлебом',
    slotKinds: ['breakfast'],
    steps: [
      'Яйца пожарьте на сковороде (антипригарная или капля масла).',
      'Рядом огурец, помидор или капуста из лотка.',
      'Хлеб; тонкий слой сливочного масла — по желанию.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.45 },
      { productKey: 'vegetables', share: 0.25 },
      { productKey: 'bread_whole', share: 0.2 },
      { productKey: 'butter', share: 0.1, optional: true },
    ],
  },
  {
    id: 'cottage_banana',
    label: 'Творог с бананом',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Творог в миске, банан кружками сверху — или взбейте блендером в крем.',
      'По желанию горсть грецкого ореха.',
    ],
    parts: [
      { productKey: 'cottage_cheese_5', share: 0.55 },
      { productKey: 'banana', share: 0.35 },
      { productKey: 'nuts_walnut', share: 0.1, optional: true },
    ],
  },
  {
    id: 'kefir_oats_apple',
    label: 'Кефир с овсянкой и яблоком',
    slotKinds: ['breakfast'],
    steps: [
      'Овсянку залейте кефиром на 10–15 мин (или с вечера в холодильнике).',
      'Яблоко нарежьте кубиками и вмешайте; блендером — в густой смузи-кашу.',
    ],
    parts: [
      { productKey: 'kefir', share: 0.4 },
      { productKey: 'oats', share: 0.3 },
      { productKey: 'apple', share: 0.3 },
    ],
  },
  {
    id: 'yogurt_berries',
    label: 'Йогурт с ягодами',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Натуральный йогурт без сахара + ягоды (свежие или заморозка).',
      'Перемешайте ложкой или взбейте блендером; орехи — по желанию.',
    ],
    parts: [
      { productKey: 'yogurt', share: 0.6 },
      { productKey: 'berries', share: 0.3 },
      { productKey: 'nuts_walnut', share: 0.1, optional: true },
    ],
  },
  {
    id: 'buckwheat_cottage_banana',
    label: 'Гречневый крем с творогом',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Остывшая варёная гречка + творог + банан.',
      'Взбейте блендером до крема (хит ПП-блогов) или разомните вилкой.',
      'Если густо — ложка кефира.',
    ],
    parts: [
      { productKey: 'buckwheat', share: 0.3 },
      { productKey: 'cottage_cheese_5', share: 0.45 },
      { productKey: 'banana', share: 0.25 },
    ],
  },
  {
    id: 'oat_blini_cottage',
    label: 'Овсяноблин с творогом',
    slotKinds: ['breakfast'],
    steps: [
      'Овсянку залейте кипятком на 3–5 мин (или смолоть в блендере в муку).',
      'Вмешайте яйцо — тесто на блин; жарьте на сковороде с двух сторон.',
      'Начинка — творог; сверху ягоды.',
    ],
    parts: [
      { productKey: 'oats', share: 0.3 },
      { productKey: 'eggs', share: 0.25 },
      { productKey: 'cottage_cheese_5', share: 0.35 },
      { productKey: 'sunflower_oil', share: 0.05, optional: true },
      { productKey: 'berries', share: 0.05, optional: true },
    ],
  },
  {
    id: 'syrniki_pp',
    label: 'Сырники ПП',
    slotKinds: ['breakfast'],
    steps: [
      'Творог + яйцо + ложка овсянки (можно смолоть в блендере), чуть соли.',
      'Сформуйте лепёшки; жарьте на сковороде под крышкой по 3–4 мин с каждой стороны.',
      'Можно в духовке ~180 °C 15–18 мин или в аэрогриле — кому удобнее.',
      'Подайте с ягодами или яблоком.',
    ],
    parts: [
      { productKey: 'cottage_cheese_5', share: 0.55 },
      { productKey: 'eggs', share: 0.2 },
      { productKey: 'oats', share: 0.15 },
      { productKey: 'berries', share: 0.1, optional: true },
      { productKey: 'sunflower_oil', share: 0.05, optional: true },
    ],
  },
  {
    id: 'egg_bread_toast',
    label: 'Гренки в яйце',
    slotKinds: ['breakfast'],
    steps: [
      'Яйцо взбейте вилкой с солью; обмакните хлеб с двух сторон.',
      'Обжарьте на сковороде до румянца.',
      'Сбоку овощи.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.4 },
      { productKey: 'bread_whole', share: 0.35 },
      { productKey: 'vegetables', share: 0.15, optional: true },
      { productKey: 'butter', share: 0.1, optional: true },
    ],
  },

  // —— Перекус ——
  {
    id: 'apple_cottage_snack',
    label: 'Яблоко с творогом',
    slotKinds: ['snack'],
    steps: [
      'Яблоко дольками; творог рядом или чуть взбейте блендером «для макания».',
    ],
    parts: [
      { productKey: 'apple', share: 0.45 },
      { productKey: 'cottage_cheese_5', share: 0.55 },
    ],
  },
  {
    id: 'kefir_banana_snack',
    label: 'Кефир с бананом',
    slotKinds: ['snack'],
    steps: [
      'Банан разомните вилкой в кефире или взбейте блендером в смузи — минута.',
    ],
    parts: [
      { productKey: 'kefir', share: 0.55 },
      { productKey: 'banana', share: 0.45 },
    ],
  },
  {
    id: 'apple_nuts_snack',
    label: 'Яблоко с орехами',
    slotKinds: ['snack'],
    steps: ['Яблоко нарежьте.', 'Съешьте с горстью грецкого ореха.'],
    parts: [
      { productKey: 'apple', share: 0.7 },
      { productKey: 'nuts_walnut', share: 0.3 },
    ],
  },
  {
    id: 'protein_drink_banana',
    label: 'Белковый напиток с бананом',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Банан разомните вилкой или взбейте блендером.',
      'Залейте высокобелковым напитком 0% (Exponenta High-Pro и аналоги из Магнита/Пятёрочки) — или вмешайте сухой протеин в воду/кефир.',
      'Готово за минуту, без плиты.',
    ],
    parts: [
      { productKey: 'protein_drink_hp', share: 0.65 },
      { productKey: 'banana', share: 0.35 },
    ],
  },
  {
    id: 'whey_oats_berries',
    label: 'Овсянка с протеином',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Овсянку залейте кипятком на 5–7 мин.',
      'Вмешайте порцию сывороточного протеина (20–30 г) до однородности — блендером или вилкой.',
      'Сверху ягоды; если густо — чуть воды или кефира.',
    ],
    parts: [
      { productKey: 'oats', share: 0.4 },
      { productKey: 'whey_protein', share: 0.4 },
      { productKey: 'berries', share: 0.2, optional: true },
    ],
  },
  {
    id: 'cheese_toast_egg',
    label: 'Тост с лёгким сыром и яйцом',
    slotKinds: ['breakfast'],
    steps: [
      'Яйцо пожарьте или сварите на плите.',
      'На хлеб тонко — сыр лёгкий (до 17%) или творожный сыр из холодильника магазина.',
      'Сбоку овощи.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.35 },
      { productKey: 'cheese_light', share: 0.25 },
      { productKey: 'bread_whole', share: 0.25 },
      { productKey: 'vegetables', share: 0.15, optional: true },
    ],
  },
  {
    id: 'chicken_cottage_pate',
    label: 'Куриный паштет с творогом',
    slotKinds: ['snack', 'breakfast'],
    steps: [
      'Грудку отварите или запеките в духовке (~180 °C), остудите.',
      'В блендере: курица + творог + ложка бульона/воды, соль, перец — до паштета (вилкой дольше).',
      'На хлеб или с овощами.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.4 },
      { productKey: 'cottage_cheese_5', share: 0.35 },
      { productKey: 'bread_whole', share: 0.2 },
      { productKey: 'vegetables', share: 0.05, optional: true },
    ],
  },

  // —— Обед / ужин ——
  {
    id: 'chicken_buckwheat_salad',
    label: 'Курица с гречкой и салатом',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Гречку отварите на плите (как на пачке).',
      'Грудку кубиками потушите на сковороде под крышкой ~10 мин или запеките в духовке.',
      'Смешайте с гречкой; салат с ложкой подсолнечного масла. Аэрогриль — по желанию.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.35 },
      { productKey: 'buckwheat', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1 },
    ],
  },
  {
    id: 'simple_chicken_rice',
    label: 'Курица с рисом',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Рис отварите на плите.',
      'Грудку отварите или запеките в духовке без панировки.',
      'Подавайте вместе; капля масла — по желанию.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.45 },
      { productKey: 'rice', share: 0.45 },
      { productKey: 'sunflower_oil', share: 0.1, optional: true },
    ],
  },
  {
    id: 'chicken_potato_salad',
    label: 'Курица с картофелем и овощами',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Картофель отварите; грудку — на сковороде или в духовке (~180 °C).',
      'Свежий салат с ложкой масла. В аэрогриле оба продукта — если привычнее.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.35 },
      { productKey: 'potato', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1 },
    ],
  },
  {
    id: 'fish_potato_salad',
    label: 'Минтай с картофелем и салатом',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Филе минтая/трески из заморозки потушите на сковороде или запеките в духовке.',
      'Картофель отварите; свежий салат. Аэрогриль — запасной вариант.',
    ],
    parts: [
      { productKey: 'fish_white', share: 0.35 },
      { productKey: 'potato', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1, optional: true },
    ],
  },
  {
    id: 'beef_buckwheat_veg',
    label: 'Говядина с гречкой и овощами',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Говядину из лотка потушите на плите до мягкости (дольше курицы) или в духовке в рукаве.',
      'Гречку отварите; овощи свежие или тушёные сбоку.',
    ],
    parts: [
      { productKey: 'beef_lean', share: 0.35 },
      { productKey: 'buckwheat', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1, optional: true },
    ],
  },
  {
    id: 'turkey_pasta_salad',
    label: 'Индейка с макаронами и салатом',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Индейку кусочками обжарьте на сковороде или запеките в духовке.',
      'Макароны отварите; салат с маслом.',
    ],
    parts: [
      { productKey: 'turkey_breast', share: 0.35 },
      { productKey: 'pasta', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1 },
    ],
  },
  {
    id: 'caesar_pp',
    label: 'Салат «Цезарь» ПП',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Грудку обжарьте на сковороде без панировки или запеките в духовке; нарежьте.',
      'Капуста, огурец, помидор из лотка.',
      'Заправка: йогурт + чайная ложка масла; сухарики из хлеба по желанию.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.4 },
      { productKey: 'vegetables', share: 0.3 },
      { productKey: 'yogurt', share: 0.15 },
      { productKey: 'sunflower_oil', share: 0.1 },
      { productKey: 'bread_whole', share: 0.05, optional: true },
    ],
  },
  {
    id: 'fish_rice_salad',
    label: 'Рыба с рисом и овощами',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Минтай/хек запеките в духовке или отварите / потушите на сковороде.',
      'Рис отварите; овощи свежие; масло по желанию.',
    ],
    parts: [
      { productKey: 'fish_white', share: 0.35 },
      { productKey: 'rice', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1, optional: true },
    ],
  },
  {
    id: 'chicken_egg_yogurt_salad',
    label: 'Салат с курицей и яйцом',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Грудку отварите или обжарьте; яйца сварите на плите.',
      'Нарежьте с огурцом/капустой/помидором.',
      'Заправка — йогурт, соль, перец (без майонеза).',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.35 },
      { productKey: 'eggs', share: 0.2 },
      { productKey: 'vegetables', share: 0.3 },
      { productKey: 'yogurt', share: 0.1 },
      { productKey: 'sunflower_oil', share: 0.05, optional: true },
    ],
  },
  {
    id: 'rice_egg_veg',
    label: 'Рис с яйцом и овощами',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Рис отварите на плите (удобно вчерашний).',
      'Яичница или скрэмбл на сковороде + овощи; смешайте с рисом.',
    ],
    parts: [
      { productKey: 'rice', share: 0.4 },
      { productKey: 'eggs', share: 0.3 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1, optional: true },
    ],
  },
  {
    id: 'turkey_buckwheat_salad',
    label: 'Индейка с гречкой',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Индейку кусочками обжарьте на сковороде или запеките в духовке.',
      'Гречку отварите; салат с ложкой масла.',
    ],
    parts: [
      { productKey: 'turkey_breast', share: 0.35 },
      { productKey: 'buckwheat', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1 },
    ],
  },
]
