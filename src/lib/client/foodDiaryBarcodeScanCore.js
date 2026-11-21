/**
 * Форматы штрихкода продуктов для BarcodeDetector (камера).
 * Ручной ввод цифр в UI не используем — только скан.
 */
export const FOOD_BARCODE_SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

/** Есть ли в браузере сканер штрихкода (Chrome/Android и новые WebKit). */
export function foodBarcodeScanSupported(globalObj = globalThis) {
  return typeof globalObj?.BarcodeDetector === 'function'
}
