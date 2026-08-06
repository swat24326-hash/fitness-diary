/**
 * Имя продукта только из src/lib/productBrand.js — без хардкода в UI.
 * node scripts/verify-product-brand.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brand = await import(pathToFileURL(path.join(root, 'src/lib/productBrand.js')).href)

const {
  PRODUCT_BRAND_NAME,
  PRODUCT_BRAND_SHORT,
  PRODUCT_BRAND_LOCKUP,
  PRODUCT_BRAND_LEGACY_UI_NAMES,
} = brand

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(Boolean(PRODUCT_BRAND_NAME && PRODUCT_BRAND_LOCKUP), 'brand constants present')
ok(PRODUCT_BRAND_SHORT === PRODUCT_BRAND_NAME || PRODUCT_BRAND_SHORT.length > 0, 'short name set')

/** Файлы, где имя продукта может встречаться только через импорт / sync */
const SCAN_DIRS = ['src/components', 'src/pages', 'src/context']
const SCAN_ROOT_FILES = ['vite.config.js', 'scripts/generate-icons.mjs']

/** Исключения: не бренд продукта */
const ALLOW_FILE_SNIPPETS = [
  { file: 'SalesSegmentComparablePaceChart.jsx', re: /Ось:\s*%/ },
  { file: 'coachQualityConfigCore.js', re: /Ось ведения|Ось хвостов/ },
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue
      walk(p, out)
    } else if (/\.(jsx?|mjs|tsx?)$/.test(ent.name)) {
      out.push(p)
    }
  }
  return out
}

const forbiddenLiterals = [
  PRODUCT_BRAND_NAME,
  PRODUCT_BRAND_LOCKUP,
  ...PRODUCT_BRAND_LEGACY_UI_NAMES,
].filter((s, i, a) => s && a.indexOf(s) === i)

let hits = 0
const files = [
  ...SCAN_DIRS.flatMap((d) => walk(path.join(root, d))),
  ...SCAN_ROOT_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)),
]

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  if (rel.includes('productBrand.js')) continue
  // generate-icons / vite must import brand — check they import, not hardcode current name as lone string later
  let text = fs.readFileSync(file, 'utf8')
  for (const lit of forbiddenLiterals) {
    if (!text.includes(lit)) continue
    const lines = text.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (!line.includes(lit)) return
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*') || line.trimStart().startsWith('/*')) {
        return
      }
      // import { ... } from productBrand — ok if line only imports
      if (/from ['"].*productBrand/.test(line)) return
      if (line.includes('PRODUCT_BRAND_') && !line.includes(`'${lit}'`) && !line.includes(`"${lit}"`)) {
        // usage via constant name in template — still might contain lit if template wrong
      }
      const allowed = ALLOW_FILE_SNIPPETS.some(
        (a) => rel.endsWith(a.file) && a.re.test(line),
      )
      if (allowed) return
      // vite/generate-icons: must use imported binding, not quoted literal
      if (
        (rel === 'vite.config.js' || rel === 'scripts/generate-icons.mjs') &&
        (line.includes(`'${lit}'`) || line.includes(`"${lit}"`) || line.includes(`\`${lit}\``))
      ) {
        console.error(`FAIL: hardcoded brand «${lit}» in ${rel}:${idx + 1}`)
        console.error(`  ${line.trim()}`)
        hits++
        return
      }
      if (rel.startsWith('src/') && (line.includes(`'${lit}'`) || line.includes(`"${lit}"`) || line.includes(`>${lit}<`) || line.includes(` ${lit} `) || line.includes(`«${lit}»`) || line.endsWith(lit) || line.includes(`${lit} `))) {
        // template with constant interpolation is fine: `${PRODUCT_BRAND_NAME}` won't include the literal Cyrillic in source if using constant
        // but `Стандарт Ядро` would
        if (line.includes('PRODUCT_BRAND_')) return
        console.error(`FAIL: hardcoded brand «${lit}» in ${rel}:${idx + 1}`)
        console.error(`  ${line.trim()}`)
        hits++
      }
    })
  }
}

ok(hits === 0, `no hardcoded product brand in UI sources (${forbiddenLiterals.join(', ')})`)

// sync artifacts match brand module
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
ok(indexHtml.includes(`<title>${PRODUCT_BRAND_NAME}</title>`), 'index.html title synced')
ok(indexHtml.includes(`content="${PRODUCT_BRAND_SHORT}"`), 'index.html apple title synced')

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'))
ok(manifest.name === PRODUCT_BRAND_NAME, 'manifest.name synced')
ok(manifest.short_name === PRODUCT_BRAND_SHORT, 'manifest.short_name synced')

const lockup = fs.readFileSync(path.join(root, 'public/brand/os-lockup.svg'), 'utf8')
ok(lockup.includes(`>${PRODUCT_BRAND_LOCKUP}</text>`), 'os-lockup.svg lockup synced')

console.log('verify-product-brand: all passed')
