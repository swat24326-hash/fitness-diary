/**
 * Бренд приложений для клиентов и тренеров на телефоне (/me, /coach) — «Результат Плюс».
 * Не путать с продуктом для клуба (productBrand.js — «Ядро»: зал, админка, продажи)
 * и с названием клуба (подпись значка при установке, шапка).
 * Знак и значок пока Ядра — свой логотип «Результат Плюс» позже (решение владельца 11.10.2026).
 */
import { productBrandManifestIcons } from './productBrand.js'

export const APP_BRAND_NAME = 'Результат Плюс'

export const APP_BRAND_COACH_TITLE = `${APP_BRAND_NAME} · тренер`

export function appBrandManifestIcons() {
  return productBrandManifestIcons([192, 512])
}
