/**
 * Книга рецептов — как сосед соседу: плита, сковорода, духовка.
 * Продукты с полки «Пятёрочки» / «Магнита», ЦФО.
 *
 * Техника в шагах:
 * 1) плита / сковорода / духовка — основной путь;
 * 2) блендер — только где реально удобно (смузи, паштет, мука из овсянки);
 * 3) аэрогриль — запасной вариант для мяса/картофеля, никогда для свежего салата.
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
      'Залейте овсянку кипятком, накройте миску на 5–7 минут — как геркулес из пачки.',
      'Вмешайте творог вилкой. Если любите совсем гладко — можно взбить блендером.',
      'Сверху ягоды: свежие или из заморозки, можно прямо мёрзлые.',
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
      'Пожарьте яйца на сковороде — на антипригарной или с каплей масла.',
      'Рядом положите свежие овощи: огурец, помидор или капусту.',
      'Хлеб — как есть; тонкий слой сливочного масла, если хочется.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.45 },
      { productKey: 'vegetables', share: 0.25 },
      { productKey: 'bread_whole', share: 0.25 },
      { productKey: 'butter', share: 0.05, optional: true },
    ],
  },
  {
    id: 'cottage_banana',
    label: 'Творог с бананом',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Творог в миску, сверху кружки банана — и ешьте ложкой.',
      'Хотите помягче — разомните банан вилкой и смешайте с творогом.',
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
      'Залейте овсянку кефиром на 10–15 минут (можно с вечера поставить в холодильник).',
      'Яблоко нарежьте кубиками и вмешайте ложкой.',
      'Если нравится густой смузи — тогда уже блендером, но вилкой тоже нормально.',
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
      'Возьмите натуральный йогурт без сахара и ягоды (свежие или заморозка).',
      'Перемешайте ложкой. Орехи сверху — по желанию.',
    ],
    parts: [
      { productKey: 'yogurt', share: 0.6 },
      { productKey: 'berries', share: 0.3 },
      { productKey: 'nuts_walnut', share: 0.1, optional: true },
    ],
  },
  {
    id: 'buckwheat_cottage_banana',
    label: 'Гречка с творогом и бананом',
    slotKinds: ['breakfast', 'snack'],
    steps: [
      'Отварите гречку на плите, как написано на пачке, и дайте чуть остыть.',
      'В миске смешайте гречку с творогом ложкой, сверху — кружки банана.',
      'Если сухо — ложка кефира. Блендер здесь не нужен.',
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
      'Овсянку залейте кипятком на 3–5 минут. Или смолотите сухую в блендере в муку — так блин тоньше.',
      'Вмешайте яйцо, получится жидкое тесто. Жарьте на сковороде с двух сторон.',
      'На готовый блин намажьте творог, сверху ягоды — и сверните.',
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
    label: 'Сырники',
    slotKinds: ['breakfast'],
    steps: [
      'Смешайте творог, яйцо и ложку овсянки (овсянку можно заранее смолоть в муку), чуть посолите.',
      'Сформируйте лепёшки и жарьте на сковороде под крышкой по 3–4 минуты с каждой стороны.',
      'Можно запечь в духовке при ~180 °C минут 15–18 — меньше масла.',
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
      'Взбейте яйцо вилкой с солью. Обмакните хлеб с двух сторон.',
      'Обжарьте на сковороде до румянца.',
      'Сбоку свежие овощи.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.4 },
      { productKey: 'bread_whole', share: 0.4 },
      { productKey: 'vegetables', share: 0.15, optional: true },
      { productKey: 'butter', share: 0.05, optional: true },
    ],
  },
  {
    id: 'apple_cottage_snack',
    label: 'Яблоко с творогом',
    slotKinds: ['snack'],
    steps: [
      'Нарежьте яблоко дольками.',
      'Творог положите рядом или чуть разомните вилкой — удобно макать яблоко.',
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
      'Разомните банан вилкой прямо в кефире — готово за минуту.',
      'Если хочется напиток — взбейте блендером в смузи.',
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
    steps: ['Нарежьте яблоко.', 'Съешьте с горстью грецкого ореха — простой перекус.'],
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
      'Разомните банан вилкой (или взбейте блендером, если хотите глаже).',
      'Залейте белковым напитком 0% из магазина (Exponenta и аналоги) — или размешайте сухой протеин в воде/кефире.',
      'Плита не нужна, готово сразу.',
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
      'Залейте овсянку кипятком на 5–7 минут.',
      'Вмешайте порцию сывороточного протеина (20–30 г) вилкой до однородности.',
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
      'Яйцо пожарьте или сварите.',
      'На хлеб тонко намажьте лёгкий сыр или творожный сыр из холодильника.',
      'Рядом овощи — огурец или помидор.',
    ],
    parts: [
      { productKey: 'eggs', share: 0.35 },
      { productKey: 'cheese_light', share: 0.2 },
      { productKey: 'bread_whole', share: 0.3 },
      { productKey: 'vegetables', share: 0.15 },
    ],
  },
  {
    id: 'chicken_cottage_pate',
    label: 'Куриный паштет с творогом',
    slotKinds: ['snack', 'breakfast'],
    steps: [
      'Грудку отварите или запеките в духовке (~180 °C), остудите.',
      'Измельчите с творогом, ложкой бульона или воды, солью и перцем — блендером быстрее, вилкой тоже можно.',
      'Намажьте на хлеб или ешьте с овощами.',
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
      'Отварите гречку на плите, как на пачке.',
      'Грудку нарежьте кубиками и потушите на сковороде под крышкой минут 10 — или запеките в духовке (~180 °C).',
      'Смешайте курицу с гречкой. Свежий салат с ложкой масла подайте рядом — сырым, отдельно.',
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
      'Отварите рис на плите.',
      'Грудку отварите или запеките в духовке без панировки.',
      'Положите рядом на тарелку; капля масла — по желанию.',
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
      'Картофель отварите. Грудку пожарьте на сковороде или запеките в духовке (~180 °C).',
      'Свежий салат с ложкой масла — рядом на тарелке, сырым.',
      'Картофель и курицу при желании можно запечь в аэрогриле; салат всё равно не грейте.',
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
      'Филе минтая или трески из заморозки потушите на сковороде или запеките в духовке.',
      'Картофель отварите. Свежий салат — отдельно, сырым, с ложкой масла.',
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
      'Говядину потушите на плите до мягкости (дольше, чем курица) или запеките в рукаве в духовке.',
      'Гречку отварите. Овощи — свежие сбоку или слегка потушите на сковороде.',
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
      'Макароны отварите. Салат с маслом — свежий, рядом на тарелке.',
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
    label: 'Салат «Цезарь» без майонеза',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Грудку обжарьте на сковороде без панировки или запеките в духовке, нарежьте.',
      'Нарежьте капусту, огурец, помидор.',
      'Заправка: йогурт + чайная ложка масла, соль. Сухарики из хлеба — по желанию.',
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
      'Минтай или хек запеките в духовке, отварите или потушите на сковороде.',
      'Рис отварите. Овощи свежие рядом; масло — по желанию.',
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
      'Грудку отварите или обжарьте. Яйца сварите вкрутую.',
      'Нарежьте всё вместе с огурцом, капустой или помидором.',
      'Заправьте йогуртом, солью и перцем — без майонеза.',
    ],
    parts: [
      { productKey: 'chicken_breast', share: 0.3 },
      { productKey: 'eggs', share: 0.2 },
      { productKey: 'vegetables', share: 0.3 },
      { productKey: 'yogurt', share: 0.15 },
      { productKey: 'sunflower_oil', share: 0.05, optional: true },
    ],
  },
  {
    id: 'rice_egg_veg',
    label: 'Рис с яйцом и овощами',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Отварите рис (удобно взять вчерашний из холодильника).',
      'Сделайте яичницу на сковороде, добавьте овощи и смешайте с рисом.',
    ],
    parts: [
      { productKey: 'rice', share: 0.4 },
      { productKey: 'eggs', share: 0.3 },
      { productKey: 'vegetables', share: 0.25 },
      { productKey: 'sunflower_oil', share: 0.05, optional: true },
    ],
  },
  {
    id: 'turkey_buckwheat_salad',
    label: 'Индейка с гречкой',
    slotKinds: ['lunch', 'dinner'],
    steps: [
      'Индейку кусочками обжарьте на сковороде или запеките в духовке.',
      'Гречку отварите. Свежий салат с ложкой масла — рядом, сырым.',
    ],
    parts: [
      { productKey: 'turkey_breast', share: 0.35 },
      { productKey: 'buckwheat', share: 0.35 },
      { productKey: 'vegetables', share: 0.2 },
      { productKey: 'sunflower_oil', share: 0.1 },
    ],
  },
]
