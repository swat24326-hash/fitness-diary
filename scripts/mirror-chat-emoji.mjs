/**
 * Зеркало Noto Animated Emoji (Google, CC BY 4.0) в public/chat-emoji/ — раздаём со своего origin,
 * без fonts.gstatic.com. Те же SVG и Lottie, что раньше с CDN.
 *
 *   node scripts/mirror-chat-emoji.mjs          # докачать недостающее
 *   node scripts/mirror-chat-emoji.mjs --force  # перекачать всё
 *   node scripts/mirror-chat-emoji.mjs --check  # только проверить, что SVG на месте (без сети)
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { CHAT_EMOJI_CATALOG } from '../src/lib/chat/chatEmojiCatalog.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public', 'chat-emoji')
const SRC = 'https://fonts.gstatic.com/s/e/notoemoji/latest/'
const CONCURRENCY = 12
const force = process.argv.includes('--force')
const checkOnly = process.argv.includes('--check')
/** На CDN Noto Animated нет файлов (©️ ®️) — в каталоге остаются текстом, зеркало не валим. */
const CDN_NO_SVG = new Set(['a9_fe0f', 'ae_fe0f'])

function keyOf(emoji) {
  return [...String(emoji)].map((c) => c.codePointAt(0).toString(16)).join('_')
}

const keys = [...new Set(CHAT_EMOJI_CATALOG.flatMap((g) => g.items).map(keyOf))]

async function fetchTo(url, dest) {
  const res = await fetch(url)
  if (res.status === 404) return 'missing'
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return 'ok'
}

async function mirrorOne(key) {
  const dir = join(OUT, key)
  const svg = join(dir, 'emoji.svg')
  const lottie = join(dir, 'lottie.json')
  const needSvg = force || !existsSync(svg)
  const needLottie = force || !existsSync(lottie)
  let svgStatus = needSvg ? await fetchTo(`${SRC}${key}/emoji.svg`, svg) : 'skip'
  let lottieStatus = 'skip'
  if (needLottie) {
    try {
      lottieStatus = await fetchTo(`${SRC}${key}/lottie.json`, lottie)
    } catch {
      lottieStatus = 'fail'
    }
  }
  return { key, svgStatus, lottieStatus }
}

function checkLocal() {
  let svg = 0
  let lottie = 0
  const missing = []
  for (const key of keys) {
    if (existsSync(join(OUT, key, 'emoji.svg'))) svg++
    else missing.push(key)
    if (existsSync(join(OUT, key, 'lottie.json'))) lottie++
  }
  return { svg, lottie, missing }
}

function missingFail(missing) {
  return missing.filter((k) => !CDN_NO_SVG.has(k))
}

if (checkOnly) {
  const { svg, lottie, missing } = checkLocal()
  const bad = missingFail(missing)
  if (bad.length) {
    console.error(`mirror-chat-emoji --check: нет SVG у ${bad.length} ключей (есть ${svg}/${keys.length}). Запустите: node scripts/mirror-chat-emoji.mjs`)
    process.exit(1)
  }
  console.log(`mirror-chat-emoji --check: ок, SVG ${svg}, Lottie ${lottie} из ${keys.length}`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(
  join(OUT, 'NOTICE.txt'),
  [
    'Noto Animated Emoji',
    'Copyright Google Inc.',
    'License: Creative Commons Attribution 4.0 International (CC BY 4.0)',
    'https://creativecommons.org/licenses/by/4.0/',
    'Source: https://fonts.gstatic.com/s/e/notoemoji/ (Noto Animated Emoji)',
    'Mirrored for same-origin delivery by Ядро / Fitness Diary. Files unchanged.',
    '',
  ].join('\n'),
)

let done = 0
const stats = { ok: 0, skip: 0, missing: 0, fail: 0 }
const queue = [...keys]
async function worker() {
  while (queue.length) {
    const key = queue.shift()
    const r = await mirrorOne(key)
    done++
    for (const s of [r.svgStatus, r.lottieStatus]) {
      if (s === 'ok') stats.ok++
      else if (s === 'skip') stats.skip++
      else if (s === 'missing') stats.missing++
      else if (s === 'fail') stats.fail++
    }
    if (done % 50 === 0 || done === keys.length) {
      console.log(`mirror-chat-emoji: ${done}/${keys.length}`)
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

const local = checkLocal()
const bad = missingFail(local.missing)
const meta = {
  at: new Date().toISOString(),
  keys: keys.length,
  svg: local.svg,
  lottie: local.lottie,
  source: SRC,
  base: '/chat-emoji/',
  allowMissingSvg: [...CDN_NO_SVG],
}
writeFileSync(join(OUT, 'mirror.json'), `${JSON.stringify(meta, null, 2)}\n`)
if (bad.length) {
  console.error(`mirror-chat-emoji: нет SVG у ${bad.length}: ${bad.slice(0, 8).join(', ')}…`)
  process.exit(1)
}
console.log(
  `mirror-chat-emoji: готово — SVG ${local.svg}, Lottie ${local.lottie}; скачано ${stats.ok}, пропуск ${stats.skip}, нет на CDN ${stats.missing}, сбой ${stats.fail}` +
    (local.missing.length ? `; без файла (норма): ${local.missing.join(', ')}` : ''),
)
