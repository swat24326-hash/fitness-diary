/**
 * Анкета здоровья (по мотивам PAR-Q+ и первичной консультации в клубе): вопросы «да / нет» с уточнением.
 * Ключи — контракт хранения в health_screenings.answers: не переименовывать без миграции данных.
 * avoid — метки библиотеки домашних упражнений (HOMEWORK_AVOID), noImpact — без прыжков и ударной нагрузки.
 */

/** Блок 1 — допуск к нагрузке. Любое «да» — авто-ДЗ ждёт подтверждения тренера, нагрузка щадящая. */
export const SCREEN_CLEARANCE = [
  { id: 'heart', label: 'Сердце', hint: 'ИБС, аритмия, порок, инфаркт, стент', avoid: ['pressure'], details: { ihd: 'ИБС', arrhythmia: 'Аритмия', defect: 'Порок', infarct: 'Инфаркт / стент' } },
  { id: 'pressure', label: 'Давление', details: { high: 'Повышенное', low: 'Пониженное', pills: 'Держится таблетками' }, avoidIf: { high: ['pressure'] } },
  { id: 'chest_pain', label: 'Боль или давящее чувство в груди', avoid: ['pressure'], details: { load: 'При нагрузке', rest: 'В покое' } },
  { id: 'dizzy', label: 'Головокружения, потери сознания', avoid: ['pressure'] },
  { id: 'breath', label: 'Одышка сильнее, чем должна быть при нагрузке' },
  { id: 'diabetes', label: 'Диабет', details: { t1: '1 тип', t2: '2 тип', hypo: 'Бывают падения сахара' } },
  { id: 'lungs', label: 'Астма или хроническая болезнь лёгких' },
  { id: 'epilepsy', label: 'Эпилепсия' },
  { id: 'oncology', label: 'Онкология', details: { treatment: 'Сейчас лечится', remission: 'Ремиссия' } },
  { id: 'veins', label: 'Варикоз, тромбозы', details: { varicose: 'Варикоз', thrombosis: 'Тромбоз' } },
  { id: 'abdominal_hernia', label: 'Грыжа живота', hint: 'Паховая, пупочная — нельзя натуживаться', noImpact: true },
  { id: 'surgery', label: 'Операция или серьёзная травма за 12 месяцев' },
  { id: 'doctor_limit', label: 'Врач запрещал или ограничивал нагрузку' },
  { id: 'meds', label: 'Препараты', details: { pulse: 'От давления / для пульса', blood_thinners: 'Разжижающие кровь', insulin: 'Инсулин', hormones: 'Гормоны' } },
]

/** Блок 2 — суставы и спина по зонам. */
export const SCREEN_ZONES = [
  { id: 'neck', label: 'Шея' },
  { id: 'shoulder_l', label: 'Плечо левое', avoid: ['shoulders'] },
  { id: 'shoulder_r', label: 'Плечо правое', avoid: ['shoulders'] },
  { id: 'elbow_wrist', label: 'Локоть, запястье', avoid: ['wrists'] },
  { id: 'thoracic', label: 'Грудной отдел' },
  { id: 'lumbar', label: 'Поясница', avoid: ['back'] },
  { id: 'hip', label: 'Таз, тазобедренный' },
  { id: 'knee_l', label: 'Колено левое', avoid: ['knees'] },
  { id: 'knee_r', label: 'Колено правое', avoid: ['knees'] },
  { id: 'ankle', label: 'Голеностоп, стопа' },
]

export const SCREEN_ZONE_STATUS = { now: 'Болит сейчас', sometimes: 'Бывает', past: 'Старая травма, не болит' }

export const SCREEN_ZONE_DIAGNOSIS = {
  hernia: 'Грыжа / протрузия',
  arthrosis: 'Артроз',
  surgery: 'Операция / эндопротез',
  ligament: 'Разрыв связок / мениска',
  scoliosis: 'Сколиоз',
  instability: 'Нестабильность',
}

/** Что вызывает боль → какие упражнения убрать. */
export const SCREEN_ZONE_TRIGGERS = {
  bend: { label: 'Наклон', avoid: ['back'] },
  twist: { label: 'Скручивание', avoid: ['back'] },
  axial: { label: 'Нагрузка на позвоночник сверху', avoid: ['back'] },
  squat: { label: 'Присед', avoid: ['knees'] },
  lunge: { label: 'Выпад', avoid: ['knees'] },
  jump: { label: 'Прыжки', avoid: [], noImpact: true },
  overhead: { label: 'Руки над головой', avoid: ['shoulders'] },
  hands: { label: 'Упор на руки', avoid: ['wrists'] },
  static: { label: 'Долго стоять / сидеть', avoid: [] },
}

/** Отдельные строки блока 2. */
export const SCREEN_BONES = [
  { id: 'osteoporosis', label: 'Остеопороз', hint: 'Без прыжков и наклонов со скруглённой спиной', avoid: ['back'], noImpact: true },
  { id: 'hypermobility', label: 'Гипермобильность суставов' },
]

/** Блок 3 — женское здоровье (показываем при поле «женский»). pregnancy — всегда через тренера. */
export const SCREEN_WOMEN = [
  { id: 'pregnancy', label: 'Беременность', hint: 'Срок — в поле «что именно»', noImpact: true, needsTrainer: true },
  { id: 'postpartum', label: 'Роды за последний год', noImpact: true },
  { id: 'diastasis', label: 'Диастаз (расхождение мышц живота)', noImpact: true },
  { id: 'pelvic_floor', label: 'Проблемы тазового дна', noImpact: true },
  { id: 'menopause', label: 'Менопауза' },
]

/** Блок 4 — опыт, быт, дом: подбор, не медицина. */
export const SCREEN_LIFE = {
  experience: {
    label: 'Опыт регулярных тренировок',
    options: { none: 'Нет опыта', lt6m: 'Меньше полугода', lt2y: 'От полугода до 2 лет', gt2y: 'Больше 2 лет' },
  },
  work: { label: 'Характер работы', options: { sitting: 'Сидячая', mixed: 'Смешанная', standing: 'Весь день на ногах' } },
  steps: { label: 'Шагов в день', options: { low: 'Меньше 5 000', mid: '5 000 – 10 000', high: 'Больше 10 000' } },
  sleep: { label: 'Сон', options: { bad: 'Меньше 6 часов или плохо спит', ok: '6–7 часов', good: '7 часов и больше, высыпается' } },
  stress: { label: 'Уровень стресса', options: { low: 'Низкий', mid: 'Средний', high: 'Высокий' } },
  home_days: { label: 'Сколько дней в неделю может заниматься дома', options: { 1: '1 день', 2: '2 дня', 3: '3 дня', 4: '4 и больше' } },
  home_minutes: { label: 'Сколько минут на одно занятие', options: { 20: '20 минут', 30: '30 минут', 45: '45 минут' } },
}

/** Что есть дома (несколько). none — «без инвентаря» доступно всегда. */
export const SCREEN_EQUIPMENT = { mat: 'Коврик', band: 'Фитнес-резинка', dumbbells: 'Гантели', support: 'Степ или устойчивый стул' }

export const SCREEN_LEVEL_BY_EXPERIENCE = { none: 1, lt6m: 1, lt2y: 2, gt2y: 3 }
