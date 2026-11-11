/**
 * Бренд приложений клиента и тренера на телефоне (/me, /coach).
 * Запасное имя (клуб ещё неизвестен) = продукт «Ядро» (productBrand.js).
 * После входа подпись значка и шапка — название клуба.
 * Знак и значок — те же, что у продукта (свой логотип клуба/сети — позже).
 */
import { PRODUCT_BRAND_NAME, productBrandManifestIcons } from './productBrand.js'

export const APP_BRAND_NAME = PRODUCT_BRAND_NAME

export const APP_BRAND_COACH_TITLE = `${APP_BRAND_NAME} · тренер`

export function appBrandManifestIcons() {
  return productBrandManifestIcons([192, 512])
}
