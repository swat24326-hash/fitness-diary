/**
 * Подсказки ИСКРЫ по работе в приложении FIT-CITY.
 */

import { iskraReplyHeader, joinIskraReply } from './iskraReplyCompact.js'
import { buildKbInstantReply } from './iskraKnowledgeBaseCore.js'

/** @typedef {'general'|'client'|'membership'|'sync'|'trainer'|'structure'|'deploy'} IskraAppGuideTopic */

const GUIDE_LINES = {
  general:
    'Клиенты — раздел «Клиенты», тренировки — из карточки клиента. Данные пишутся локально и уходят в облако при sync.',
  client:
    'Новый клиент: «Клиенты» → «Добавить» → ФИО и тренер. Карточка откроется — там абонементы, медкарта и тренировки.',
  membership:
    'Абонемент: карточка клиента → вкладка абонементов → тип из справочника, даты и остаток. Списание — при завершении тренировки.',
  sync:
    'Sync: кнопка в шапке. Сначала очередь на сервер, потом подтягивание из облака. На планшете без сети работайте — запишется локально.',
  trainer:
    'Тренер: черновик тренировки → упражнения → «Завершить». Админ создаёт тренеров в «Организация»; управляющий ведёт своих клиентов как тренер.',
  structure:
    'Админ: «Организация» — клубы и тренеры; «Статистика» — сводка клуба; «ИСКРА» — аналитика. Управляющий видит свой клуб без смены филиала в шапке.',
  deploy:
    'Прод: git push в main и деплой на Vercel. Supabase — миграции и RLS по чеклисту docs/SUPABASE_PROD_CHECKLIST.md. Ошибки — «Диагностика» в админке.',
}

function normalizeGuideText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/**
 * @param {string} userMessage
 * @returns {IskraAppGuideTopic | null}
 */
export function matchIskraAppGuideIntent(userMessage) {
  const s = normalizeGuideText(userMessage)
  if (!s) return null
  if (/создать\s+клиент|новый\s+клиент|добавить\s+клиент|как\s+клиент/.test(s)) return 'client'
  if (/абонемент|membership|остаток\s+тренировок/.test(s)) return 'membership'
  if (/синхрон|sync|офлайн|очеред|не\s+сохран|не\s+улетел/.test(s)) return 'sync'
  if (/тренер|тренировк|черновик|завершить\s+трен/.test(s) && !/статистик/.test(s)) return 'trainer'
  if (/организац|структур|клуб|админк|раздел|вкладк|где\s+найти/.test(s)) return 'structure'
  if (/деплой|vercel|supabase|прод|релиз|не\s+работает\s+сайт/.test(s)) return 'deploy'
  if (/как\s+работ|приложен|fit-?city|подсказ|инструкц|помощь\s+по/.test(s)) return 'general'
  return null
}

/**
 * @param {IskraAppGuideTopic} [topic]
 * @param {{ club?: string, period?: string, advisorRoleId?: string, userMessage?: string }} [opts]
 */
export function buildIskraAppGuideReply(topic = 'general', opts = {}) {
  const club = String(opts.club ?? 'клуб').trim()
  const period = String(opts.period ?? 'месяц').trim()
  const userMessage = String(opts.userMessage ?? '').trim()
  const kbReply = buildKbInstantReply(userMessage, topic)
  const line = kbReply || GUIDE_LINES[topic] || GUIDE_LINES.general
  const roleHint =
    opts.advisorRoleId === 'app_admin'
      ? ' Полный доступ — «Организация», диагностика, настройки ИСКРА.'
      : opts.advisorRoleId === 'club_supervisor'
        ? ' Управляющий: свой клуб в шапке, клиенты клуба — в разделе «Клуб» (когда появится) или через админа.'
        : ''
  return joinIskraReply(iskraReplyHeader(club, period), `${line}${roleHint}`)
}

export function buildIskraAppGuideRule() {
  return [
    'Вопросы про приложение (клиент, sync, разделы) — отвечай из app_knowledge и articles в JSON, без выдуманных кнопок.',
    'Формат: краткий ответ → нумерованные шаги из базы знаний → при необходимости одно уточнение.',
    'Не подменяй техподсказку цифрами плана, если спросили «как сделать в приложении».',
  ].join(' ')
}
