/**
 * Парсер «Быстрой загрузки» упражнений.
 *
 * Рекомендуемый формат — блок на упражнение (пустая строка между блоками):
 *
 *   Название: Присед со штангой
 *   Направленность: Ноги / Ягодицы
 *   Основные мышцы: Квадрицепсы, ягодичные
 *   Примечание: Колени не выходят за носки
 *
 * Альтернатива — одна строка на упражнение, разделитель | или таб:
 *   Присед | Ноги | Квадрицепсы, ягодичные | Примечание
 */

const LABELS = [
  { key: 'name', re: /^(название|name)\s*[:：]\s*/i },
  { key: 'muscle_group', re: /^(направленность|направление|группа|muscle_group)\s*[:：]\s*/i },
  { key: 'primary_muscles', re: /^(основные\s*мышцы|мышцы|primary_muscles)\s*[:：]\s*/i },
  { key: 'comment', re: /^(примечание|комментарий|comment|заметка)\s*[:：]\s*/i },
]

function detectLabeledFormat(text) {
  return /^\s*(название|name)\s*[:：]/im.test(text)
}

/** @returns {{ exercises: object[], errors: string[], warnings: string[] }} */
export function parseBulkExercises(text) {
  const raw = String(text ?? '').trim()
  if (!raw) {
    return { exercises: [], errors: ['Вставьте текст с упражнениями.'], warnings: [] }
  }

  if (detectLabeledFormat(raw)) {
    return parseLabeledBlocks(raw)
  }
  return parseDelimiterLines(raw)
}

function parseLabeledBlocks(text) {
  const blocks = splitLabeledBlocks(text)
  const exercises = []
  const errors = []
  const warnings = []

  blocks.forEach((block, i) => {
    const row = parseLabeledBlock(block)
    if (!row.name?.trim()) {
      errors.push(`Блок ${i + 1}: нет «Название».`)
      return
    }
    if (!row.muscle_group?.trim()) {
      errors.push(`Блок ${i + 1} («${row.name.slice(0, 40)}…»): нет «Направленность».`)
      return
    }
    exercises.push({
      name: row.name.trim(),
      muscle_group: row.muscle_group.trim(),
      primary_muscles: row.primary_muscles?.trim() || null,
      comment: row.comment?.trim() || null,
    })
  })

  if (!exercises.length && !errors.length) {
    errors.push('Не найдено ни одного блока. Начните блок со строки «Название: …».')
  }

  return { exercises, errors, warnings }
}

function splitLabeledBlocks(text) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let buf = []

  const flush = () => {
    const joined = buf.join('\n').trim()
    if (joined) blocks.push(joined)
    buf = []
  }

  for (const line of lines) {
    if (/^\s*(название|name)\s*[:：]/i.test(line) && buf.length) {
      flush()
      buf.push(line)
    } else if (!line.trim() && buf.length) {
      flush()
    } else {
      buf.push(line)
    }
  }
  flush()
  return blocks
}

function parseLabeledBlock(block) {
  const row = { name: '', muscle_group: '', primary_muscles: '', comment: '' }
  let lastKey = null

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const matched = matchLabelLine(trimmed)
    if (matched) {
      row[matched.key] = matched.value
      lastKey = matched.key
      continue
    }

    if (lastKey) {
      row[lastKey] = `${row[lastKey]} ${trimmed}`.trim()
    }
  }

  return row
}

function matchLabelLine(line) {
  for (const { key, re } of LABELS) {
    const m = line.match(re)
    if (m) {
      return { key, value: line.slice(m[0].length).trim() }
    }
  }
  return null
}

function parseDelimiterLines(text) {
  const exercises = []
  const errors = []
  const warnings = []

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  lines.forEach((line, i) => {
    const parts = splitDelimiterLine(line)
    if (parts.length < 2) {
      errors.push(
        `Строка ${i + 1}: нужно минимум «Название» и «Направленность». Используйте формат с подписями (Название: …) или разделитель |.`,
      )
      return
    }
    const [name, muscle_group, primary_muscles, comment] = parts
    if (!name?.trim() || !muscle_group?.trim()) {
      errors.push(`Строка ${i + 1}: пустое название или направленность.`)
      return
    }
    exercises.push({
      name: name.trim(),
      muscle_group: muscle_group.trim(),
      primary_muscles: primary_muscles?.trim() || null,
      comment: comment?.trim() || null,
    })
  })

  if (!exercises.length && !errors.length) {
    errors.push('Нет распознанных строк.')
  }

  if (lines.some((l) => l.includes(',') && !l.includes('|') && !l.includes('\t'))) {
    warnings.push(
      'В однострочном формате запятые внутри полей ломают разбор. Лучше формат с «Название:» на строках или разделитель |.',
    )
  }

  return { exercises, errors, warnings }
}

function splitDelimiterLine(line) {
  if (line.includes('|')) {
    return line.split('|').map((p) => p.trim())
  }
  if (line.includes('\t')) {
    return line.split('\t').map((p) => p.trim())
  }
  return line.split(',').map((p) => p.trim())
}
