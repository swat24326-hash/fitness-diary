/**
 * Базовые шаблоны ДЗ (простые домашние движения, разные направления).
 * Сидятся в БД клуба при первом открытии Structure → вкладка «ДЗ».
 */

/** @typedef {{ label: string, exercises: Array<{ name: string, sets: number, reps: string, rest_sec: number }> }} HomeworkPresetBlockSeed */

/**
 * @type {Array<{ title: string, direction: string, description: string, blocks: HomeworkPresetBlockSeed[] }>}
 */
export const HOMEWORK_PRESET_SEED = [
  {
    title: 'Спина без боли',
    direction: 'Мобилити / поясница',
    description: 'Мягкая мобильность и активация мышц кора для дома.',
    blocks: [
      {
        label: 'Мобилити',
        exercises: [
          { name: 'Кошка-корова', sets: 2, reps: '10', rest_sec: 20 },
          { name: 'Вращения таза стоя', sets: 2, reps: '8 на сторону', rest_sec: 20 },
          { name: 'Наклоны вперёд с опорой на стол', sets: 2, reps: '8', rest_sec: 30 },
        ],
      },
      {
        label: 'Сила и контроль',
        exercises: [
          { name: 'Птица-собака', sets: 2, reps: '8 на сторону', rest_sec: 30 },
          { name: 'Ягодичный мост', sets: 2, reps: '12', rest_sec: 40 },
        ],
      },
    ],
  },
  {
    title: 'Утренний заряд',
    direction: 'Общее / активация',
    description: 'Короткая зарядка на 8–12 минут после пробуждения.',
    blocks: [
      {
        label: 'Разминка',
        exercises: [
          { name: 'Круговые движения плечами', sets: 2, reps: '10', rest_sec: 15 },
          { name: 'Марш на месте', sets: 2, reps: '30 сек', rest_sec: 20 },
        ],
      },
      {
        label: 'Активация',
        exercises: [
          { name: 'Приседания без веса', sets: 2, reps: '12', rest_sec: 40 },
          { name: 'Отжимания от стены', sets: 2, reps: '10', rest_sec: 40 },
          { name: 'Планка на предплечьях', sets: 2, reps: '20 сек', rest_sec: 40 },
        ],
      },
    ],
  },
  {
    title: 'Ягодицы + Пресс',
    direction: 'Ягодицы / кор',
    description: 'Домашний акцент на ягодицы и стабильный центр.',
    blocks: [
      {
        label: 'Ягодицы',
        exercises: [
          { name: 'Ягодичный мост', sets: 3, reps: '12', rest_sec: 45 },
          { name: 'Отведения бедра лёжа', sets: 2, reps: '12 на сторону', rest_sec: 30 },
          { name: 'Выпады назад на месте', sets: 2, reps: '10 на ногу', rest_sec: 45 },
        ],
      },
      {
        label: 'Пресс',
        exercises: [
          { name: 'Мёртвый жук', sets: 2, reps: '8 на сторону', rest_sec: 30 },
          { name: 'Планка', sets: 2, reps: '25 сек', rest_sec: 40 },
        ],
      },
    ],
  },
  {
    title: 'МФР и растяжка',
    direction: 'Восстановление',
    description: 'Мягкая растяжка и самомассаж после нагрузки.',
    blocks: [
      {
        label: 'МФР',
        exercises: [
          { name: 'Ролл икроножных (бутылка/ролл)', sets: 1, reps: '60 сек на ногу', rest_sec: 20 },
          { name: 'Ролл задней поверхности бедра', sets: 1, reps: '60 сек на ногу', rest_sec: 20 },
        ],
      },
      {
        label: 'Растяжка',
        exercises: [
          { name: 'Растяжка грудного отдела у стены', sets: 2, reps: '30 сек', rest_sec: 15 },
          { name: 'Растяжка сгибателей бедра', sets: 2, reps: '30 сек на ногу', rest_sec: 15 },
          { name: 'Поза ребёнка', sets: 1, reps: '60 сек', rest_sec: 0 },
        ],
      },
    ],
  },
  {
    title: 'Домашнее кардио',
    direction: 'Кардио дома',
    description: 'Лёгкое кардио без оборудования, комфортный темп.',
    blocks: [
      {
        label: 'Кардио',
        exercises: [
          { name: 'Марш на месте', sets: 3, reps: '45 сек', rest_sec: 30 },
          { name: 'Джампинг-джек без прыжка', sets: 3, reps: '30 сек', rest_sec: 30 },
          { name: 'Степ-тач', sets: 3, reps: '40 сек', rest_sec: 30 },
          { name: 'Высокие колени низкоамплитудно', sets: 2, reps: '30 сек', rest_sec: 40 },
        ],
      },
    ],
  },
]
