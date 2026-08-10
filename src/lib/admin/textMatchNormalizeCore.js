/**
 * Нормализация текста для матча Excel ↔ справочники (типы карт и т.п.).
 * Без React / IDB.
 */

/**
 * Кириллические буквы, визуально как латиница (СОТ vs COT), → латиница.
 * Вызывать после toLowerCase.
 * @param {string} s
 */
export function foldLatinCyrillicLookalikes(s) {
  return String(s ?? '')
    .replace(/а/g, 'a')
    .replace(/б/g, 'b')
    .replace(/в/g, 'b')
    .replace(/с/g, 'c')
    .replace(/е/g, 'e')
    .replace(/ё/g, 'e')
    .replace(/г/g, 'g')
    .replace(/н/g, 'h')
    .replace(/и/g, 'i')
    .replace(/к/g, 'k')
    .replace(/м/g, 'm')
    .replace(/о/g, 'o')
    .replace(/р/g, 'p')
    .replace(/т/g, 't')
    .replace(/х/g, 'x')
    .replace(/у/g, 'y')
    .replace(/з/g, 'z')
}
