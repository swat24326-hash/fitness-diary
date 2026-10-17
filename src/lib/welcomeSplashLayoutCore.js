/**
 * Общая геометрия boot-splash (index.html) и React AppWelcomeSplash.
 * Один размер/зум — иначе при снятии #yadro-boot-splash знак дёргается.
 */

/** Финальный размер знака (px) — OsMark и конец boot-зума. */
export const WELCOME_MARK_PX = 96

/** Стартовый масштаб относительно WELCOME_MARK_PX (~220px на экране). */
export const WELCOME_BOOT_ZOOM_FROM = 2.3

/** Длительность зума boot / React (мс). */
export const WELCOME_BOOT_ZOOM_MS = 1150

/** Easing зума — как в index.html. */
export const WELCOME_BOOT_ZOOM_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Зазор от центра знака до блока «Приветствуем» (половина mark + воздух). */
export const WELCOME_COPY_OFFSET_PX = 64
