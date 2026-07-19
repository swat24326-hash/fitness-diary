/**
 * Бренд продукта (SaaS / ОС клуба) — не путать с названием клуба-тенанта.
 * Клуб (напр. FIT-CITY) приходит из данных клуба; продукт — константы ниже.
 * Канон: docs/BRAND_SYSTEM.md
 *
 * «Ось» — центр вращения клуба; tagline объясняет, что это ОС.
 * Не путать с модулем ИСКРА.
 */

/** Латиница (код, домен, экспорт) */
export const PRODUCT_BRAND_ID = 'AXIS'

/** Основное имя в русском UI (предложения, настройки) */
export const PRODUCT_BRAND_NAME = 'Ось'

/** Короткое для PWA / узких мест */
export const PRODUCT_BRAND_SHORT = 'Ось'

/**
 * Локкап логотипа (капс, стиль Лебедева).
 * Шапка, splash, иконки — через это; в предложениях — PRODUCT_BRAND_NAME.
 */
export const PRODUCT_BRAND_LOCKUP = 'ОСЬ'

/** Подзаголовок продукта (русский) */
export const PRODUCT_BRAND_TAGLINE = 'Операционная система фитнес-клуба'

/** Пример/первый клуб-тенант (не имя продукта) */
export const REFERENCE_CLUB_NAME = 'FIT-CITY'

export function productBrandAriaOnline(online) {
  return online
    ? `${PRODUCT_BRAND_NAME}, подключение к сети есть`
    : `${PRODUCT_BRAND_NAME}, нет подключения к сети`
}

/**
 * Title окна / PWA: клуб, без «Ось — … - Ось».
 * Манифест name = «Ось»; document.title = клуб → в Windows не дублируется.
 */
export function productBrandDocumentTitle(clubLabel) {
  const club = String(clubLabel ?? '').trim()
  if (!club || club === '…' || club === '—' || club === 'Выберите клуб') {
    return PRODUCT_BRAND_NAME
  }
  return club
}
