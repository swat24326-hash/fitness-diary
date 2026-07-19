/**
 * Банк фраз для полоски Sync + отчёт последнего Sync для Помощи.
 * Без React / IndexedDB.
 */

const LAST_SYNC_REPORT_KEY = 'fd_last_sync_report_v1'

/** @type {ReturnType<typeof normalizeLastSyncReport>} */
let lastSyncReportMemory = null

/** @typedef {{ id: string, text: string, source?: string }} SyncMotivationCard */

/** @type {SyncMotivationCard[]} */
export const SYNC_MOTIVATION_CARDS = [
  {
    id: '1',
    text: 'Сила не в том, чтобы никогда не падать, а в том, чтобы подниматься каждый раз.',
    source: 'Конфуций',
  },
  {
    id: '2',
    text: 'Мы то, что постоянно делаем. Совершенство — не действие, а привычка.',
    source: 'Аристотель',
  },
  {
    id: '3',
    text: 'Сначала мы формируем привычки, потом привычки формируют нас.',
    source: 'Джон Драйден',
  },
  {
    id: '4',
    text: 'Дисциплина — это мост между целью и достижением.',
    source: 'Джим Рон',
  },
  {
    id: '5',
    text: 'Не ждите идеального момента. Возьмите момент и сделайте его идеальным.',
    source: 'неизвестный автор',
  },
  {
    id: '6',
    text: 'Маленькие ежедневные улучшения лучше редких рывков.',
    source: 'по смыслу «Атомарных привычек» (Д. Клир)',
  },
  {
    id: 'A4',
    text: 'Все хотят быть бодибилдерами, но никто не хочет поднимать тяжёлые железяки.',
    source: 'Ронни Коулман',
  },
  {
    id: 'A5',
    text: 'Именно последние три–четыре повторения растят мышцу.',
    source: 'Арнольд Шварценеггер',
  },
  {
    id: 'A7',
    text: 'Я ненавидел каждую минуту тренировок. Но говорил себе: потерпи сейчас — и остаток жизни будь чемпионом.',
    source: 'Мухаммед Али',
  },
  {
    id: 'A8',
    text: 'Ты не забиваешь 100% бросков, которые не делаешь.',
    source: 'Уэйн Гретцки',
  },
  {
    id: 'A9',
    text: 'Я ошибался снова и снова. Поэтому и побеждаю.',
    source: 'Майкл Джордан',
  },
  {
    id: 'A10',
    text: 'Труд побеждает талант, если талант не трудится.',
    source: 'спортивный афоризм',
  },
  {
    id: 'A11',
    text: 'Сопротивление в зале и сопротивление в жизни качают один и тот же характер.',
    source: 'Арнольд Шварценеггер',
  },
  {
    id: '8',
    text: 'Сон — не пауза между тренировками: без него сила и настроение падают быстрее, чем без одного пропуска в зале.',
  },
  {
    id: '9',
    text: 'Привычка держится не на мотивации понедельника, а на повторе в обычный вторник.',
  },
  {
    id: '10',
    text: 'Клиент чаще возвращается не из‑за идеальной программы, а из‑за ощущения, что его заметили.',
  },
  {
    id: '11',
    text: 'Короткий честный разговор после тренировки иногда стоит больше, чем ещё один подход.',
  },
  {
    id: '12',
    text: 'Sync работает. В отличие от клиента, который «начнёт с понедельника» уже третий месяц.',
  },
  {
    id: '14',
    text: 'Если бы абонемент сам себя продлевал — мы бы тут не стояли.',
  },
  {
    id: '15',
    text: 'Данные синхронизируются. Ваш кофе — пока нет.',
  },
  {
    id: '16',
    text: 'Тренер, который заполнил дневник, уже выиграл половину спора с будущим собой.',
  },
  {
    id: 'J1',
    text: '«Лёгкая тренировка» у клиента обычно значит: разминка, селфи и внезапно срочные дела.',
  },
  {
    id: 'J2',
    text: 'Болит не от вчерашней ноги. Болит от того, что совесть вспомнила про пропуск.',
  },
  {
    id: 'J3',
    text: 'Если клиент говорит «я и так ем правильно» — готовьте место для правды и весов.',
  },
  {
    id: 'J4',
    text: 'Смерть мотивации наступает тихо: без разминки, без дневника и с фразой «сегодня без железа».',
  },
  {
    id: 'J5',
    text: 'Зал не убивает. Убивает привычка пропускать и потом удивляться зеркалу.',
  },
  {
    id: 'J6',
    text: 'Синхронизация быстрее, чем клиент признаёт, что купил абонемент «для души», а не для приседа.',
  },
  {
    id: 'J7',
    text: 'Черновик тренировки без упражнений — это не минимализм. Это преступление против статистики.',
  },
  {
    id: 'J8',
    text: '«Я почти пришёл» и «я почти дожал» — двоюродные братья. Оба не считаются.',
  },
  {
    id: '17',
    text: 'Сначала закройте то, что висит с утра: один звонок важнее пяти «потом».',
  },
  {
    id: '18',
    text: 'Клиент пропал на неделю — не с упрёка, а с «как ты?».',
  },
  {
    id: '19',
    text: 'Пустая запись в дневнике хуже тонкой: тонкую можно улучшить.',
  },
  {
    id: '20',
    text: 'Перед сменой: кого из «тихих» я сегодня не заметил?',
  },
  {
    id: '21',
    text: 'План продаж любит факты. Факты любит заполненный отчёт.',
  },
  {
    id: '22',
    text: 'Не тащите домой чужой стресс зала — оставьте его в приложении.',
  },
  {
    id: 'M1',
    text: '«Люди покупают у тех, кому доверяют.» Доверие в зале копится подходами и вниманием — не скидкой в сторис.',
  },
  {
    id: 'M2',
    text: 'Не продавай абонемент. Продай следующий результат, который человеку уже не терпится увидеть.',
  },
  {
    id: 'M3',
    text: 'Лучший маркетинг тренера — клиент, который сам приводит друга. Реклама врёт реже, чем живой «мне помогло».',
  },
  {
    id: 'M4',
    text: '«Цена — это то, что платят. Ценность — то, что получают.» Если человек не видит ценности тренировок, любая цена кажется высокой.',
  },
  {
    id: 'M5',
    text: 'Молчаливый довольный клиент не продлевает сам. Продление начинается с разговора за 7–10 дней до конца карты — спокойно, по делу, без стыда.',
  },
  {
    id: 'M6',
    text: '«Скидка без причины учит ждать скидку.» Лучше бонус за явку и дневник, чем вечная «акция для своих».',
  },
  {
    id: 'M7',
    text: 'Продажа в зале — не давление. Это вовремя заданный вопрос: «Как тебе прогресс за месяц — идём дальше тем же ритмом?»',
  },
  {
    id: 'M8',
    text: 'Потерянный лид часто не «отказ», а недозвон. Один короткий follow-up сильнее десяти идеальных скриптов, которые так и не прозвучали.',
  },
  {
    id: '23',
    text: 'Готово. Можно снова к людям — цифры уже на планшете.',
  },
]

export const SYNC_FINISH_CARD_ID = '23'

/** Пауза в зоне (мс), после которой можно сменить карточку той же зоны. */
export const SYNC_MOTTO_ZONE_ROTATE_MS = 10_000

/**
 * @param {number} percent
 * @returns {0|1|2|3|4}
 */
export function getSyncMotivationZone(percent) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0))
  if (p >= 100) return 4
  if (p >= 75) return 3
  if (p >= 50) return 2
  if (p >= 25) return 1
  return 0
}

/**
 * @returns {number}
 */
export function createSyncSessionSeed() {
  const t = Date.now() >>> 0
  const r = Math.floor(Math.random() * 1e9) >>> 0
  return (t ^ r) >>> 0
}

/**
 * @param {number} seed
 * @returns {() => number} 0..1
 */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param {string} id
 * @returns {SyncMotivationCard | null}
 */
export function getSyncMotivationCardById(id) {
  const key = String(id ?? '')
  return SYNC_MOTIVATION_CARDS.find((c) => c.id === key) ?? null
}

/**
 * @param {{
 *   percent: number,
 *   sessionSeed: number,
 *   excludeIds?: string[],
 *   slot?: number,
 * }} opts
 * @returns {SyncMotivationCard}
 */
export function pickSyncMotivationCard(opts) {
  const percent = Number(opts?.percent) || 0
  const zone = getSyncMotivationZone(percent)
  const finish = getSyncMotivationCardById(SYNC_FINISH_CARD_ID)
  if (zone === 4 && finish) return finish

  const exclude = new Set((opts?.excludeIds ?? []).map(String))
  const slot = Math.max(0, Math.floor(Number(opts?.slot) || 0))
  const seed = (Number(opts?.sessionSeed) || 0) >>> 0

  let pool = SYNC_MOTIVATION_CARDS.filter((c) => c.id !== SYNC_FINISH_CARD_ID && !exclude.has(c.id))
  if (pool.length === 0) {
    pool = SYNC_MOTIVATION_CARDS.filter((c) => c.id !== SYNC_FINISH_CARD_ID)
  }

  const rand = mulberry32((seed + zone * 1009 + slot * 9176) >>> 0)
  const idx = Math.floor(rand() * pool.length) % pool.length
  return pool[idx] ?? finish ?? pool[0]
}

/**
 * @param {SyncMotivationCard | null | undefined} card
 * @returns {{ text: string, source: string }}
 */
export function formatSyncMotto(card) {
  const text = String(card?.text ?? '').trim()
  const source = String(card?.source ?? '').trim()
  return { text, source }
}

/**
 * Эвристика для verify: длинные карточки обычно не влезают в окно ~3–4 строк.
 * @param {SyncMotivationCard | null | undefined} card
 * @param {{ maxChars?: number }} [opts]
 * @returns {boolean}
 */
export function cardLikelyNeedsScroll(card, opts = {}) {
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : 95
  const { text, source } = formatSyncMotto(card)
  const len = text.length + (source ? source.length + 4 : 0)
  return len > maxChars
}

/**
 * @typedef {{
 *   at: number,
 *   tone: 'ok' | 'warn' | 'err',
 *   parts: string[],
 *   message: string,
 * }} LastSyncReport
 */

/**
 * @param {unknown} raw
 * @returns {LastSyncReport | null}
 */
function normalizeLastSyncReport(raw) {
  if (!raw || typeof raw !== 'object') return null
  const at = Number(/** @type {{ at?: unknown }} */ (raw).at)
  if (!Number.isFinite(at) || at <= 0) return null
  const toneRaw = String(/** @type {{ tone?: unknown }} */ (raw).tone ?? 'ok')
  const tone = toneRaw === 'warn' || toneRaw === 'err' ? toneRaw : 'ok'
  const parts = Array.isArray(/** @type {{ parts?: unknown }} */ (raw).parts)
    ? /** @type {unknown[]} */ (/** @type {{ parts: unknown }} */ (raw).parts)
        .map((p) => String(p ?? '').trim())
        .filter(Boolean)
    : []
  const message = String(/** @type {{ message?: unknown }} */ (raw).message ?? '').trim() || parts.join(' · ')
  return { at, tone, parts, message }
}

/**
 * @returns {LastSyncReport | null}
 */
export function getLastSyncReport() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LAST_SYNC_REPORT_KEY)
      if (raw) {
        const parsed = normalizeLastSyncReport(JSON.parse(raw))
        if (parsed) {
          lastSyncReportMemory = parsed
          return parsed
        }
      }
    }
  } catch {
    /* ignore */
  }
  return lastSyncReportMemory
}

/**
 * @param {{
 *   at?: number,
 *   tone?: 'ok' | 'warn' | 'err',
 *   parts?: string[],
 *   message?: string,
 * }} report
 * @returns {LastSyncReport | null}
 */
export function setLastSyncReport(report) {
  const next = normalizeLastSyncReport({
    at: report?.at ?? Date.now(),
    tone: report?.tone ?? 'ok',
    parts: report?.parts ?? [],
    message: report?.message ?? '',
  })
  if (!next) return null
  lastSyncReportMemory = next
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_REPORT_KEY, JSON.stringify(next))
    }
  } catch {
    /* ignore quota */
  }
  return next
}

/**
 * @param {number} at
 * @returns {string}
 */
export function formatLastSyncReportTime(at) {
  const ms = Number(at)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  try {
    return new Date(ms).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
