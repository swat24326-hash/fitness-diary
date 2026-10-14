/**
 * Словарь меток библиотеки домашних упражнений (для генератора авто-ДЗ).
 * Ключи — контракт: генератор, verify и будущие настройки клиента опираются на них.
 */

export const HOMEWORK_GOALS = {
  fat_loss: 'Похудение',
  tone: 'Набор / тонус',
  general: 'ОФП',
  posture: 'Статика / осанка / спина',
  endurance: 'Выносливость',
  mobility: 'Мобильность / растяжка',
}

export const HOMEWORK_PATTERNS = {
  squat: 'Присед',
  lunge: 'Выпады / одна нога',
  hinge: 'Наклон (задняя цепь)',
  glute: 'Ягодицы',
  calf: 'Голень',
  push: 'Толчок (грудь, плечи, трицепс)',
  pull: 'Тяга (спина, бицепс)',
  core: 'Кор / пресс',
  cardio: 'Кардио',
  mobility: 'Мобильность',
  stretch: 'Растяжка',
}

/** Части занятия: каждое ДЗ = разминка → основная часть → заминка. */
export const HOMEWORK_PHASES = {
  warmup: 'Разминка',
  main: 'Основная часть',
  cooldown: 'Заминка',
}

export const HOMEWORK_EQUIPMENT = {
  none: 'Без инвентаря',
  support: 'Опора (стул, диван, ступенька)',
  band: 'Резинка',
  dumbbells: 'Гантели',
}

/**
 * Что считаем доступным дома по умолчанию: резинка — стандарт клуба;
 * гантели — с подсказкой «чем заменить» (household / alt у записи).
 */
export const HOMEWORK_DEFAULT_EQUIPMENT = ['none', 'support', 'band', 'dumbbells']

/** Ограничения клиента: упражнение с такой меткой ему не подбираем. */
export const HOMEWORK_AVOID = {
  back: 'Поясница',
  knees: 'Колени',
  shoulders: 'Плечи',
  wrists: 'Запястья',
  pressure: 'Давление',
}

export const HOMEWORK_FOCUS = {
  lower: 'Низ тела',
  upper: 'Верх тела',
  core: 'Кор',
  full: 'Всё тело',
}

export const HOMEWORK_LEVELS = {
  1: 'Новичок',
  2: 'Средний',
  3: 'Продвинутый',
}

/** reps — повторы, sec — секунды (удержание или работа на время). */
export const HOMEWORK_UNITS = {
  reps: 'Повторы',
  sec: 'Секунды',
}
