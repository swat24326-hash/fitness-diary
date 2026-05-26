import {
  APP_ERROR_SOURCE_LABELS,
  formatAppErrorTime,
  getAppErrors,
  sourceLabel,
} from './appErrorJournal.js'

export const APP_VERSION = '0.1.0'

export const ERROR_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'sync', label: 'Sync' },
  { id: 'network', label: 'Сеть' },
  { id: 'api', label: 'Сервер' },
  { id: 'pull', label: 'Загрузка' },
  { id: 'auth', label: 'Вход' },
  { id: 'app', label: 'Приложение' },
]

/**
 * @param {{ user?: object, role?: string, isAdmin?: boolean, online?: boolean, supabaseReady?: boolean, clubId?: string, clubName?: string, pathname?: string, errorCount?: number, queueCount?: number }} ctx
 */
export function buildSystemState(ctx) {
  const user = ctx?.user
  return {
    at: new Date().toISOString(),
    appVersion: APP_VERSION,
    userName: user?.name ?? user?.email ?? '—',
    userEmail: user?.email ?? '—',
    userId: user?.id ?? '—',
    role: ctx?.isAdmin ? 'admin' : ctx?.role ?? '—',
    online: ctx?.online !== false,
    supabaseReady: ctx?.supabaseReady === true,
    clubId: ctx?.clubId?.trim() || '—',
    clubName: ctx?.clubName?.trim() || '—',
    pathname: ctx?.pathname ?? '—',
    errorCount: Number(ctx?.errorCount) || 0,
    queueCount: Number(ctx?.queueCount) || 0,
  }
}

/** @param {string} filterId */
export function filterAppErrors(errors, filterId) {
  const list = Array.isArray(errors) ? errors : []
  if (!filterId || filterId === 'all') return list
  return list.filter((row) => row.source === filterId)
}

/**
 * @param {{ error?: string, context?: string, status?: number, source?: string }} row
 */
export function suggestErrorHint(row) {
  const text = `${row?.error ?? ''} ${row?.context ?? ''}`.toLowerCase()
  const status = row?.status

  if (status === 401 || /unauthorized|не авториз|jwt|session/i.test(text)) {
    return 'Сессия истекла: выйдите из аккаунта и войдите снова.'
  }
  if (status === 403 || /forbidden|доступ запрещ/i.test(text)) {
    return 'Нет прав на операцию. Проверьте клуб и роль пользователя.'
  }
  if (/trainings_type_check|type_check|списание/i.test(text)) {
    return 'Старый формат тренировки в очереди. Обновите приложение (перезагрузка страницы) и нажмите Sync.'
  }
  if (/violates check constraint|check constraint/i.test(text)) {
    return 'Данные не проходят проверку на сервере. Обновите приложение; если повторяется — скопируйте отчёт администратору.'
  }
  if (status === 409 || /duplicate|unique|already exists|409/i.test(text)) {
    return 'Запись уже есть в облаке. Обычно помогает повторная синхронизация.'
  }
  if (status === 0 || /network|fetch|failed to fetch|offline|нет сети|недоступна/i.test(text)) {
    return 'Проблема с сетью. Проверьте Wi‑Fi/мобильный интернет и нажмите Sync.'
  }
  if (/timeout|timed out|aborted/i.test(text)) {
    return 'Сервер не ответил вовремя. Подождите и повторите Sync; при большой очереди отправка идёт частями.'
  }
  if (/очеред/i.test(text) || row?.source === 'sync') {
    return 'Нажмите Sync и дождитесь 100%. Данные на устройстве сохранены.'
  }
  if (row?.source === 'pull') {
    return 'Не удалось загрузить данные из облака. Проверьте сеть и выбранный клуб (для админа).'
  }
  if (row?.source === 'auth') {
    return 'Ошибка входа. Проверьте email и пароль; при повторе — сообщите администратору.'
  }
  return null
}

/** @param {object} item */
export function formatSyncQueueLine(item, index) {
  const n = index + 1
  const table = item?.table_name ?? '?'
  const op = item?.operation ?? '?'
  const id = item?.remote_id ?? item?.data?.id ?? item?.local_id ?? '—'
  const retries = item?.retry_count ?? 0
  const retryNote = retries > 0 ? ` · попыток: ${retries}` : ''
  return `${n}. ${table} · ${op} · id=${String(id).slice(0, 36)}${retryNote}`
}

/**
 * @param {{ system: ReturnType<typeof buildSystemState>, errors: object[], queue: object[], filterId?: string }} payload
 */
export function buildDiagnosticReport({ system, errors, queue, filterId = 'all' }) {
  const filtered = filterAppErrors(errors, filterId)
  const lines = []

  lines.push('=== Фитнес-дневник — диагностика ===')
  lines.push(`Сформировано: ${formatAppErrorTime(system.at)}`)
  lines.push(`Приложение: v${system.appVersion}`)
  lines.push(`Пользователь: ${system.userName} (${system.userEmail})`)
  lines.push(`ID: ${system.userId}`)
  lines.push(`Роль: ${system.role}`)
  lines.push(`Сеть: ${system.online ? 'онлайн' : 'офлайн'}`)
  lines.push(`Облако (Supabase): ${system.supabaseReady ? 'подключено' : 'локальный режим'}`)
  lines.push(`Клуб: ${system.clubName} (${system.clubId})`)
  lines.push(`Страница: ${system.pathname}`)
  lines.push(`Ошибок в журнале: ${system.errorCount}`)
  lines.push(`Очередь sync: ${system.queueCount}`)
  lines.push('')

  if (queue?.length) {
    lines.push('--- Очередь синхронизации ---')
    queue.forEach((item, i) => lines.push(formatSyncQueueLine(item, i)))
    lines.push('')
  } else {
    lines.push('--- Очередь синхронизации ---')
    lines.push('(пусто)')
    lines.push('')
  }

  lines.push(`--- Журнал ошибок${filterId !== 'all' ? ` (фильтр: ${sourceLabel(filterId)})` : ''} ---`)
  if (!filtered.length) {
    lines.push('(нет записей)')
  } else {
    filtered.forEach((row, i) => {
      lines.push('')
      lines.push(`${i + 1}. [${formatAppErrorTime(row.at)}] ${sourceLabel(row.source)}${row.status != null ? ` HTTP ${row.status}` : ''}`)
      if (row.context) lines.push(`   Контекст: ${row.context}`)
      lines.push(`   ${row.error}`)
      if (row.detail) lines.push(`   Детали: ${row.detail}`)
      const hint = suggestErrorHint(row)
      if (hint) lines.push(`   Подсказка: ${hint}`)
    })
  }

  lines.push('')
  lines.push('=== конец отчёта ===')
  return lines.join('\n')
}

export function loadDiagnosticsErrors(limit = 50) {
  return getAppErrors(limit)
}

export function errorFilterLabel(filterId) {
  return ERROR_FILTERS.find((f) => f.id === filterId)?.label ?? 'Все'
}

export { APP_ERROR_SOURCE_LABELS, formatAppErrorTime, sourceLabel }
