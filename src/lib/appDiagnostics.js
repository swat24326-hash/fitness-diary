import {
  APP_ERROR_SOURCE_LABELS,
  formatAppErrorTime,
  getAppErrors,
  isRecoverableTransientError,
  sourceLabel,
} from './appErrorJournal.js'
import { getClientBundleId, getClientBuildTimeIso, getClientBuildTimeLabel, getClientBuildAgeLabel, getPwaControllerState } from './appBuildInfo.js'
import { getAppUpdatePending } from './appUpdateState.js'
import { readIdentityCacheLatest } from './userIdentityCache.js'

function isRecoverableSyncErrorForFixes(e) {
  return isRecoverableTransientError(e)
}

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
    bundleId: getClientBundleId() ?? '—',
    buildTime: getClientBuildTimeLabel(),
    buildTimeIso: getClientBuildTimeIso() ?? '—',
    buildAge: getClientBuildAgeLabel(),
    pwaSw: getPwaControllerState(),
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
    identityCached: Boolean(readIdentityCacheLatest()?.id),
    cachedClubId: readIdentityCacheLatest()?.club_id ?? '—',
    updatePending: getAppUpdatePending(),
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
  if (
    /dynamically imported module|failed to fetch dynamically|importing a module script failed|loading chunk|chunkloaderror|vite:preload|MIME type of ["']?text\/html|Expected a JavaScript-or-Wasm module script|reading ['"]PwaUpdatePrompt['"]|reading ['"]AppUpdatedBanner['"]/i.test(
      text,
    )
  ) {
    return 'После обновления сайта открыта старая версия страницы. Нажмите Ctrl+F5 (или закройте и откройте приложение) — Sync тут не поможет.'
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
    if (/показаны данные с устройства/i.test(text)) {
      return 'Очередь уже отправлена. Не удалось подтянуть свежие данные из облака — работаете с кэшем планшета. Повторите Sync при стабильной сети.'
    }
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
  lines.push(
    `Приложение: v${system.appVersion} (сборка ${system.bundleId}${
      system.buildTime && system.buildTime !== '—'
        ? `, собрано ${system.buildTime}${system.buildAge ? ` (${system.buildAge})` : ''}`
        : ''
    })`,
  )
  lines.push(`PWA service worker: ${system.pwaSw}`)
  lines.push(`Пользователь: ${system.userName} (${system.userEmail})`)
  lines.push(`ID: ${system.userId}`)
  lines.push(`Роль: ${system.role}`)
  lines.push(`Сеть: ${system.online ? 'онлайн' : 'офлайн'}`)
  lines.push(`Облако (Supabase): ${system.supabaseReady ? 'подключено' : 'локальный режим'}`)
  lines.push(`Клуб: ${system.clubName} (${system.clubId})`)
  lines.push(`Страница: ${system.pathname}`)
  lines.push(`Ошибок в журнале: ${system.errorCount}`)
  lines.push(`Очередь sync: ${system.queueCount}`)
  if (system.identityCached != null) {
    lines.push(`Кэш профиля: ${system.identityCached ? 'да' : 'нет'}${system.cachedClubId && system.cachedClubId !== '—' ? ` (club ${system.cachedClubId})` : ''}`)
  }
  if (system.updatePending) lines.push('Обновление PWA: отложено пользователем')
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

export function formatLocalOnlyBreakdown(byTable) {
  const entries = Object.entries(byTable ?? {}).filter(([, n]) => Number(n) > 0)
  if (!entries.length) return ''
  return entries.map(([table, n]) => `${TABLE_LABELS_RU[table] ?? table}: ${n}`).join(', ')
}

const TABLE_LABELS_RU = {
  trainings: 'Тренировка',
  clients: 'Клиент',
  memberships: 'Абонемент',
  health_cards: 'Медкарта',
  body_measurements: 'Замеры',
  client_weight_entries: 'Вес',
  challenges: 'Челлендж',
  exercises: 'Упражнение',
  membership_types: 'Типы абонементов',
}

function truncateQueueError(text, max = 72) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

const OPERATION_LABELS_RU = {
  insert: 'создание',
  update: 'изменение',
  delete: 'удаление',
}

/**
 * @param {object} item
 * @param {number} index
 * @param {{ clientNames?: Record<string, string> }} [meta]
 */
export function formatSyncQueueLineHuman(item, index, meta = {}) {
  const n = index + 1
  const table = TABLE_LABELS_RU[item?.table_name] ?? item?.table_name ?? '?'
  const op = OPERATION_LABELS_RU[item?.operation] ?? item?.operation ?? '?'
  const clientId = item?.data?.client_id ?? item?.data?.id
  const clientName = clientId ? meta.clientNames?.[String(clientId)] : null
  const clientNote = clientName ? ` · ${clientName}` : ''
  const retries = item?.retry_count ?? 0
  const retryNote = retries > 0 ? ` · попыток ${retries}` : ''
  const errText = truncateQueueError(item?.last_error)
  const errNote = errText ? ` · ${errText}` : ''
  const dropNote = retries >= 10 ? ' · скоро снимется из очереди' : ''
  return `${n}. ${table}: ${op}${clientNote}${retryNote}${errNote}${dropNote}`
}

/**
 * @param {{ errors?: object[], queue?: object[], system?: ReturnType<typeof buildSystemState> }} payload
 */
export function resolveQuickFixes({ errors = [], queue = [], localOnly = 0, system = {} }) {
  /** @type {Array<{ id: string, title: string, detail: string, action?: string, tone?: string }>} */
  const fixes = []
  const list = Array.isArray(errors) ? errors : []
  const q = Array.isArray(queue) ? queue : []
  const pendingOutbound = q.length + Math.max(0, Number(localOnly) || 0)
  const online = system.online !== false

  if (!online) {
    fixes.push({
      id: 'network',
      tone: 'warn',
      title: 'Нет интернета',
      detail: 'Подключите Wi‑Fi или мобильную сеть, затем нажмите «Синхронизировать».',
      action: 'sync',
    })
  }

  const needsRelogin = list.some(
    (e) => e.status === 401 || /unauthorized|не авториз|jwt|session/i.test(String(e.error ?? '')),
  )
  if (needsRelogin) {
    fixes.push({
      id: 'relogin',
      tone: 'warn',
      title: 'Сессия истекла',
      detail: 'Выйдите из аккаунта и войдите снова — это часто снимает ошибки sync и входа.',
      action: 'relogin',
    })
  }

  const needsReload = list.some((e) =>
    /trainings_type_check|type_check|dynamically imported module|failed to fetch dynamically|loading chunk|chunkloaderror/i.test(
      String(e.error ?? ''),
    ),
  )
  if (needsReload) {
    fixes.push({
      id: 'reload',
      tone: 'warn',
      title: 'Нужно обновить приложение',
      detail:
        'После деплоя открыта старая сборка. Перезагрузите страницу (Ctrl+F5) или закройте и откройте PWA, затем при необходимости Sync.',
      action: 'reload',
    })
  }

  const queueNetworkStuck = q.some((item) => {
    const retries = item?.retry_count ?? 0
    const err = `${item?.last_error ?? ''}`.toLowerCase()
    return retries >= 3 && /сеть|network|fetch|timeout|таймаут|недоступн|offline|abort/i.test(err)
  })
  if (queueNetworkStuck && online) {
    fixes.push({
      id: 'queue-network',
      tone: 'warn',
      title: 'Очередь не уходит — похоже на сеть',
      detail:
        'Записи сохранены на устройстве, но сервер не ответил. Проверьте Wi‑Fi, подождите минуту и нажмите «Синхронизировать» снова.',
      action: 'sync',
    })
  }

  const queueAuthStuck = q.some((item) => {
    const err = `${item?.last_error ?? ''}`.toLowerCase()
    return /нет сессии|нет токена|unauthorized|jwt|401|войдите снова/i.test(err)
  })
  if (queueAuthStuck) {
    fixes.push({
      id: 'queue-relogin',
      tone: 'warn',
      title: 'Сессия истекла — очередь не отправляется',
      detail: 'Выйдите из аккаунта и войдите снова, затем нажмите «Синхронизировать».',
      action: 'relogin',
    })
  }

  if (pendingOutbound > 0 && online) {
    const parts = []
    if (q.length > 0) parts.push(`в очереди ${q.length}`)
    if (localOnly > 0) parts.push(`на устройстве ${localOnly}`)
    fixes.push({
      id: 'sync',
      tone: 'warn',
      title: `Отправить в облако (${pendingOutbound})`,
      detail: `Нажмите «Синхронизировать» и дождитесь завершения${parts.length ? `: ${parts.join(', ')}` : ''}. Данные на устройстве сохранены.`,
      action: 'sync',
    })
  } else if (
    list.some((e) => e.source === 'sync' && !isRecoverableSyncErrorForFixes(e)) && online
  ) {
    fixes.push({
      id: 'sync',
      tone: 'warn',
      title: 'Повторить синхронизацию',
      detail: 'Были ошибки отправки в облако — попробуйте Sync ещё раз.',
      action: 'sync',
    })
  }

  if (q.length > 0) {
    fixes.push({
      id: 'clean_queue',
      tone: 'info',
      title: 'Очистить битые записи в очереди',
      detail: 'Удалит заведомо испорченные или устаревшие элементы очереди (без удаления ваших тренировок).',
      action: 'clean_queue',
    })
  }

  if (list.length > 0) {
    fixes.push({
      id: 'share',
      tone: 'info',
      title: 'Сообщить администратору',
      detail: 'Отправьте отчёт в Telegram или WhatsApp — так проще найти причину, если шаги выше не помогли.',
      action: 'share',
    })
  }

  if (!fixes.length) {
    fixes.push({
      id: 'ok',
      tone: 'ok',
      title: 'Всё в порядке',
      detail: 'Ошибок нет, очередь синхронизации пуста.',
    })
  }

  return fixes
}

/** Короткий текст для мессенджера (Telegram / WhatsApp). */
export function buildShortShareText({ system, errors, queue: _queue }) {
  const last = Array.isArray(errors) && errors[0] ? errors[0] : null
  const lines = [
    'Фитнес-дневник — нужна помощь',
    `${system.userName} · ${system.role} · ${system.clubName}`,
    `Сеть: ${system.online ? 'OK' : 'нет'} · очередь: ${system.queueCount} · ошибок: ${system.errorCount}`,
  ]
  if (last) {
    lines.push(`Последняя: ${sourceLabel(last.source)} — ${String(last.error).slice(0, 120)}`)
  }
  lines.push('', 'Полный отчёт ниже ↓')
  return lines.join('\n')
}

export { APP_ERROR_SOURCE_LABELS, formatAppErrorTime, sourceLabel }
