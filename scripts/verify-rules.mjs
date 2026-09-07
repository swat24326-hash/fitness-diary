/**
 * Проверка правил Cursor (.cursor/rules/*.mdc) на дрейф.
 * node scripts/verify-rules.mjs
 *
 * Правило врёт -> агент верит вранью. Ловим четыре класса поломок:
 *   1) ссылка на файл, которого больше нет (переименовали код, правило не поправили);
 *   2) globs, который ни на что не матчится (правило молча не грузится);
 *   3) рост always-правил (это цена каждого запроса Cursor);
 *   4) лавина пересекающихся globs (на одном файле грузится полрепозитория правил).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { minimatch } from 'minimatch'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RULES_DIR = resolve(ROOT, '.cursor/rules')

/** Бюджет всегда-загружаемого контекста: always-правила + AGENTS.md. */
const ALWAYS_BUDGET = 40000

/**
 * Худший файл: постоянный контекст + все правила, чьи globs на него попали.
 * Пороги с запасом — ловим лавину пересечений, а не первое разумное совпадение
 * (компонент ПНК законно берёт pnk + split-files + ui).
 */
const PER_FILE_BUDGET = 56000
const MAX_RULES_PER_FILE = 4

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

/* --- список файлов репозитория (по git, без node_modules и мусора) --- */
const ls = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
if (ls.status !== 0) {
  console.error('FAIL: git ls-files не сработал, проверить нечего')
  process.exit(1)
}
const tracked = ls.stdout.split('\n').map((line) => line.trim()).filter(Boolean)

/** `.cursor/` может быть вне git (правила и хуки локальные), но ссылки на него проверять надо. */
function walk(relDir, acc = []) {
  const dir = resolve(ROOT, relDir)
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.state') continue
    const rel = `${relDir}/${entry.name}`
    if (entry.isDirectory()) walk(rel, acc)
    else acc.push(rel)
  }
  return acc
}
for (const path of walk('.cursor')) if (!tracked.includes(path)) tracked.push(path)

const trackedSet = new Set(tracked)

const exists = (path) => trackedSet.has(path) || existsSync(resolve(ROOT, path))
const matchesAny = (pattern) => tracked.some((file) => minimatch(file, pattern, { dot: true }))

/* --- разбор frontmatter --- */
function parseRule(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const head = match ? match[1] : ''
  const field = (name) => {
    const found = new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(head)
    return found ? found[1].trim() : null
  }
  return {
    hasFrontmatter: Boolean(match),
    description: field('description'),
    globs: field('globs'),
    alwaysApply: field('alwaysApply'),
    body: match ? text.slice(match[0].length) : text,
  }
}

/**
 * Пути, на которые правило ссылается: `в бэктиках` и в markdown-ссылках.
 * Иллюстрации вида `src/styles/<feature>.css` или `admin-data?action=` не проверяем.
 */
const KNOWN_ROOTS = ['src/', 'api/', 'scripts/', 'docs/', 'supabase/', 'public/', '.cursor/']
const ROOT_FILES = new Set([
  'package.json',
  'eslint.config.js',
  'vite.config.js',
  'index.html',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'AGENTS.md',
])
const PLACEHOLDER = /[<>…?()|,\s]|YYYY|HHMMSS/

function referencedPaths(body) {
  const found = new Set()
  const add = (raw) => {
    let token = raw.trim().replace(/^\.\/+/, '')
    while (token.startsWith('../')) token = token.slice(3)
    token = token.replace(/[.,;:!]+$/, '')
    if (!token || PLACEHOLDER.test(token)) return
    const isRepoPath = KNOWN_ROOTS.some((prefix) => token.startsWith(prefix)) || ROOT_FILES.has(token)
    if (!isRepoPath) return
    found.add(token)
  }
  for (const [, inline] of body.matchAll(/`([^`\n]+)`/g)) add(inline)
  for (const [, link] of body.matchAll(/\]\(([^)\s]+)\)/g)) add(link)
  return [...found]
}

/* --- проверки по каждому правилу --- */
const files = readdirSync(RULES_DIR).filter((name) => name.endsWith('.mdc')).sort()
assert(files.length > 0, 'правила найдены')

let alwaysChars = 0
const alwaysNames = []
/** Правила с globs — для расчёта худшего файла. */
const scopedRules = []

for (const name of files) {
  const text = readFileSync(resolve(RULES_DIR, name), 'utf8')
  const rule = parseRule(text)

  assert(rule.hasFrontmatter, `${name}: есть frontmatter`)
  assert(Boolean(rule.description), `${name}: description заполнен`)
  assert(rule.alwaysApply === 'true' || rule.alwaysApply === 'false', `${name}: alwaysApply true|false`)

  if (rule.alwaysApply === 'true') {
    alwaysChars += text.length
    alwaysNames.push(name)
  } else {
    const globs = (rule.globs || '').split(',').map((glob) => glob.trim()).filter(Boolean)
    // Без globs правило легально: Cursor подключает его по описанию, когда агент сам просит.
    if (globs.length === 0) console.log('ok:', `${name}: правило по запросу агента (описание есть, globs не нужен)`)
    for (const glob of globs) {
      // Cursor режет globs по запятой, поэтому {js,jsx} ломает шаблон целиком.
      assert(!glob.includes('{'), `${name}: glob без фигурных скобок (${glob})`)
      assert(matchesAny(glob), `${name}: glob что-то матчит (${glob})`)
    }
    if (globs.length) scopedRules.push({ name, globs, size: text.length })
  }

  // Ссылки на соседние правила и на verify по короткому имени (без пути) тоже гниют при переименовании.
  for (const [, other] of rule.body.matchAll(/`(fitness-diary-[a-z0-9-]+\.mdc)`/g)) {
    assert(exists(`.cursor/rules/${other}`), `${name}: правило существует (${other})`)
  }
  for (const [, script] of rule.body.matchAll(/`(verify-[a-z0-9-]*\*?[a-z0-9-]*)(?:\.mjs)?`/g)) {
    const target = `scripts/${script}.mjs`
    assert(script.includes('*') ? matchesAny(target) : exists(target), `${name}: verify существует (${script})`)
  }

  for (const path of referencedPaths(rule.body)) {
    if (path.includes('*')) {
      assert(matchesAny(path), `${name}: маска существует (${path})`)
    } else if (path.endsWith('/')) {
      const dir = resolve(ROOT, path)
      assert(existsSync(dir) && statSync(dir).isDirectory(), `${name}: каталог существует (${path})`)
    } else {
      assert(exists(path), `${name}: файл существует (${path})`)
    }
  }
}

/* --- цена постоянного контекста --- */
const agents = resolve(ROOT, 'AGENTS.md')
if (existsSync(agents)) alwaysChars += readFileSync(agents, 'utf8').length

console.log(`\nвсегда в контексте: ${alwaysNames.length} правил + AGENTS.md = ${alwaysChars} символов (бюджет ${ALWAYS_BUDGET})`)
assert(alwaysChars <= ALWAYS_BUDGET, `always-контекст в бюджете (${alwaysChars} <= ${ALWAYS_BUDGET})`)

/* --- цена худшего файла: постоянный контекст + все совпавшие правила --- */
let worst = { file: null, chars: alwaysChars, rules: [] }
for (const file of tracked) {
  if (!/^(src|api|scripts)\//.test(file) || !/\.(js|jsx|mjs|css)$/.test(file)) continue
  const hit = scopedRules.filter((rule) => rule.globs.some((glob) => minimatch(file, glob, { dot: true })))
  const chars = alwaysChars + hit.reduce((sum, rule) => sum + rule.size, 0)
  if (chars > worst.chars) worst = { file, chars, rules: hit.map((rule) => rule.name) }
}
const worstNames = worst.rules.map((name) => name.replace('fitness-diary-', '').replace('.mdc', '')).join(' + ')
console.log(`худший файл: ${worst.file ?? '—'} = ${worst.chars} символов (${worst.rules.length} правил: ${worstNames || '—'})`)
assert(worst.chars <= PER_FILE_BUDGET, `худший файл в бюджете (${worst.chars} <= ${PER_FILE_BUDGET})`)
assert(
  worst.rules.length <= MAX_RULES_PER_FILE,
  `на файле не больше ${MAX_RULES_PER_FILE} доменных правил (${worst.rules.length})`,
)

if (failed) {
  console.error(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nПравила Cursor: все проверки прошли')
