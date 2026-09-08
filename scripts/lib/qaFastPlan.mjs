/**
 * Быстрый режим проверок: какие verify-скрипты реально относятся к изменённым файлам.
 *
 * Связь считаем по импортам: verify-скрипт тянет модуль, который проверяет.
 * Список «зона → тесты» руками не держим — он бы отстал от кода уже через месяц.
 *
 * Здесь только чистые функции (без fs и git), чтобы их проверял
 * scripts/verify-qa-fast.mjs, а не только глаз.
 */

/** Правки, после которых узкого прогона недостаточно: ломается сама сборка, не логика. */
export const FULL_QA_TRIGGERS = [
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'eslint.config.js',
  'index.html',
  'vercel.json',
]

/*
 * Ищем сам источник (`from '…'`), а не всю конструкцию импорта: в проекте
 * импорты почти всегда многострочные, и шаблон «одной строкой» их не видел.
 */
const FROM_RE = /\bfrom\s*['"]([^'"]+)['"]/g
const SIDE_EFFECT_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g

/** @param {string} path */
function dirOf(path) {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/**
 * Собирает относительный путь без обращения к диску: 'a/b' + '../c.js' → 'a/c.js'.
 * @param {string} fromFile
 * @param {string} spec
 */
export function resolveImportPath(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const parts = `${dirOf(fromFile)}/${spec}`.split('/')
  const out = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

/**
 * @param {string} text
 * @param {string} fromFile
 * @returns {string[]} относительные пути импортов (как написаны, уже склеенные)
 */
export function collectImports(text, fromFile) {
  const found = new Set()
  for (const re of [FROM_RE, SIDE_EFFECT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const resolved = resolveImportPath(fromFile, m[1])
      if (resolved) found.add(resolved)
    }
  }
  return [...found]
}

/**
 * Все файлы проекта, до которых дотягивается verify-скрипт (транзитивно).
 * @param {{ entry: string, readFile: (path: string) => string | null, exists: (path: string) => boolean }} ctx
 */
export function collectReachableFiles({ entry, readFile, exists }) {
  const seen = new Set()
  const queue = [entry]

  while (queue.length) {
    const current = queue.pop()
    if (!current || seen.has(current)) continue
    seen.add(current)
    const text = readFile(current)
    if (!text) continue
    for (const raw of collectImports(text, current)) {
      const target = resolveExisting(raw, exists)
      if (target && !seen.has(target)) queue.push(target)
    }
  }

  seen.delete(entry)
  return seen
}

/** Импорт может быть без расширения или на папку — пробуем обычные варианты. */
function resolveExisting(path, exists) {
  const candidates = [path, `${path}.js`, `${path}.jsx`, `${path}.mjs`, `${path}/index.js`]
  for (const candidate of candidates) if (exists(candidate)) return candidate
  return null
}

/**
 * @param {{ verifyFiles: string[], readFile: (path: string) => string | null, exists: (path: string) => boolean }} ctx
 * @returns {Map<string, string[]>} файл проекта → verify-скрипты, которые его затрагивают
 */
export function buildVerifyIndex({ verifyFiles, readFile, exists }) {
  /** @type {Map<string, string[]>} */
  const index = new Map()
  for (const verify of verifyFiles) {
    for (const file of collectReachableFiles({ entry: verify, readFile, exists })) {
      const list = index.get(file)
      if (list) list.push(verify)
      else index.set(file, [verify])
    }
  }
  return index
}

const LINTABLE = /\.(js|jsx|mjs)$/

/**
 * План быстрого прогона по изменённым файлам.
 * @param {{
 *   changedFiles: string[],
 *   index: Map<string, string[]>,
 *   fullTriggers?: string[],
 * }} ctx
 */
export function planFastQa({ changedFiles, index, fullTriggers = FULL_QA_TRIGGERS }) {
  const lint = []
  const verifies = new Set()
  const uncovered = []
  const fullReasons = []

  for (const file of changedFiles) {
    const path = String(file ?? '').trim().replace(/\\/g, '/')
    if (!path) continue

    if (fullTriggers.includes(path)) {
      fullReasons.push({ file: path, reason: 'меняет саму сборку — нужен полный прогон с build' })
    }

    if (LINTABLE.test(path)) lint.push(path)

    if (path.startsWith('scripts/verify-')) {
      verifies.add(path)
      continue
    }

    const related = index.get(path)
    if (related?.length) {
      for (const verify of related) verifies.add(verify)
      continue
    }

    /* Документы и стили тестами не покрываются — это норма, а не пробел. */
    if (/\.(md|mdc|css|json|sql|txt|svg|png|ico|webmanifest)$/.test(path)) continue
    if (path.startsWith('docs/') || path.startsWith('.cursor/')) continue
    uncovered.push(path)
  }

  return {
    lint,
    verifies: [...verifies].sort(),
    uncovered,
    fullReasons,
    needsFull: fullReasons.length > 0,
  }
}
