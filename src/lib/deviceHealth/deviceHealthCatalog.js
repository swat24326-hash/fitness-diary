/**
 * Коды сбоев планшета тренера — один источник для отчёта планшета, сервера (push), страницы /admin/health
 * и иконки «Помощь» у тренера. Тексты для зала: что случилось и что сказать тренеру.
 */

export const DEVICE_HEALTH_CODES = Object.freeze({
  db_blocked: {
    critical: true,
    title: 'Данные на планшете не открываются',
    tellTrainer:
      'Закройте приложение на всех вкладках и перезагрузите планшет (выключить и включить). Данные на планшете не пропадут.',
  },
  auth_stuck: {
    critical: true,
    title: 'Сессия истекла — записи не уходят',
    tellTrainer:
      'Меню → «Восстановить приложение». Не помогло — «Выйти» и войти снова. Записи на планшете сохранятся.',
  },
  queue_stuck: {
    critical: true,
    title: 'Записи давно не уходят в облако',
    tellTrainer:
      'Нажмите Sync и дождитесь окончания. Не помогло — Меню → «Восстановить приложение». Приложение не удаляйте: записи пока только на планшете.',
  },
  pull_failing: {
    critical: false,
    title: 'Планшет не загружает данные с сервера',
    tellTrainer: 'Проверьте интернет и нажмите Sync. Не помогло — Меню → «Восстановить приложение».',
  },
  build_stale: {
    critical: false,
    title: 'Старая версия приложения',
    tellTrainer: 'Меню → «Восстановить приложение». Не помогло — перезагрузите планшет.',
  },
  server_no_pull: {
    critical: true,
    title: 'Планшет на связи, но данные не грузит',
    tellTrainer: 'Меню → «Восстановить приложение». Не помогло — перезагрузите планшет и нажмите Sync.',
  },
})

/** Коды, которые присылает сам планшет; server_no_pull ставит только сервер. */
export const DEVICE_CLIENT_CODES = Object.freeze(['db_blocked', 'auth_stuck', 'queue_stuck', 'pull_failing', 'build_stale'])

const ORDER = Object.keys(DEVICE_HEALTH_CODES)

/** Только известные коды, без повторов, в порядке важности. */
export function normalizeDeviceHealthCodes(list, allowed = ORDER) {
  const set = new Set((Array.isArray(list) ? list : []).map((c) => String(c ?? '').trim()))
  return ORDER.filter((c) => allowed.includes(c) && set.has(c))
}

export function hasCriticalDeviceCode(codes) {
  return normalizeDeviceHealthCodes(codes).some((c) => DEVICE_HEALTH_CODES[c].critical)
}

/** Текст «что сказать тренеру» для набора кодов: по одному шагу на проблему. */
export function deviceHealthInstruction(codes) {
  return normalizeDeviceHealthCodes(codes)
    .map((c) => DEVICE_HEALTH_CODES[c].tellTrainer)
    .join('\n')
}
