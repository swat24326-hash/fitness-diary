/**
 * Бренд продукта (SaaS / ОС клуба) — не путать с названием клуба-тенанта.
 * Клуб (напр. FIT-CITY) приходит из данных клуба; продукт — константы ниже.
 * Канон: docs/BRAND_SYSTEM.md
 *
 * Смена имени продукта (чтобы не разъехалось по репо):
 * 1) Правите ТОЛЬКО этот файл (NAME / LOCKUP / ID / TAGLINE).
 * 2) `npm run sync:brand` — index.html, manifest, lockup SVG.
 * 3) `npm run gen:icons` — иконки PWA.
 * 4) `node scripts/verify-product-brand.mjs` — нет хардкода имени в src/UI.
 *
 * Не путать с модулем ИСКРА и со словом «ось» в графиках / качестве ведения.
 */

/** Латиница (код, домен, экспорт) */
export const PRODUCT_BRAND_ID = 'CORE'

/** Английский ярлык при необходимости (доки, EN-контекст) */
export const PRODUCT_BRAND_NAME_EN = 'Core'

/** Основное имя в русском UI (предложения, настройки) */
export const PRODUCT_BRAND_NAME = 'Ядро'

/** Короткое для PWA / узких мест */
export const PRODUCT_BRAND_SHORT = 'Ядро'

/**
 * Локкап логотипа (капс).
 * Шапка, splash, иконки — через это; в предложениях — PRODUCT_BRAND_NAME.
 */
export const PRODUCT_BRAND_LOCKUP = 'ЯДРО'

/** Подзаголовок продукта (русский) */
export const PRODUCT_BRAND_TAGLINE = 'Операционная система фитнес-клуба'

/** Описание для PWA / store */
export const PRODUCT_BRAND_PWA_DESCRIPTION =
  'Операционная система фитнес-клуба: зал, продажи, управление'

/** Пример/первый клуб-тенант (не имя продукта) */
export const REFERENCE_CLUB_NAME = 'FIT-CITY'

/**
 * Старые имена продукта — verify ругается, если снова появятся в UI-коде.
 * (Не трогает «ось» графика и «ось ведения» в качестве тренера.)
 */
export const PRODUCT_BRAND_LEGACY_UI_NAMES = Object.freeze(['Ось', 'ОСЬ', 'AXIS', 'Порыв', 'PORYV', 'YADRO', 'Yadro'])

export function productBrandAriaOnline(online) {
  return online
    ? `${PRODUCT_BRAND_NAME}, подключение к сети есть`
    : `${PRODUCT_BRAND_NAME}, нет подключения к сети`
}

/**
 * Title окна / PWA: клуб, без дубля имени продукта.
 * Манифест name = PRODUCT_BRAND_NAME; document.title = клуб.
 */
export function productBrandDocumentTitle(clubLabel) {
  const club = String(clubLabel ?? '').trim()
  if (!club || club === '…' || club === '—' || club === 'Выберите клуб') {
    return PRODUCT_BRAND_NAME
  }
  return club
}

/** Кнопка / подпись «стандарт продукта» в настройках качества */
export function productBrandStandardLabel() {
  return `Стандарт ${PRODUCT_BRAND_NAME}`
}

/** Confirm сброса к заводским настройкам клуба */
export function productBrandResetToStandardConfirm() {
  return `Сбросить к стандарту ${PRODUCT_BRAND_NAME} (40/40/20, все тумблеры вкл)?`
}

/** Импорт Excel → «в {продукт} попадёт» */
export function productBrandImportWillLandPrefix() {
  return `в ${PRODUCT_BRAND_NAME} попадёт`
}
