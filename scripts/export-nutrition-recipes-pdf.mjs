/**
 * Одноразовая выгрузка книги рецептов в PDF на рабочий стол.
 * Запуск: node scripts/export-nutrition-recipes-pdf.mjs
 */
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { spawnSync } from 'child_process'
import { NUTRITION_RECIPE_CATALOG } from '../src/lib/nutrition/nutritionRecipeCatalog.js'
import { getNutritionProductById } from '../src/lib/nutrition/nutritionProductCatalog.js'

const SLOT = { breakfast: 'Завтрак', snack: 'Перекус', lunch: 'Обед', dinner: 'Ужин' }

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slotsLabel(kinds) {
  return (kinds ?? []).map((k) => SLOT[k] || k).join(' · ')
}

function partsLine(parts) {
  return (parts ?? [])
    .map((p) => {
      const prod = getNutritionProductById(p.productKey)
      const name = prod?.label || p.productKey
      const pct = Math.round((p.share || 0) * 100)
      return p.optional ? `${name} (по желанию)` : `${name} ~${pct}%`
    })
    .join(', ')
}

function primaryBucket(r) {
  const kinds = r.slotKinds ?? []
  if (kinds.includes('lunch') || kinds.includes('dinner')) return 'lunch'
  if (kinds.includes('breakfast')) return 'breakfast'
  if (kinds.includes('snack')) return 'snack'
  return 'breakfast'
}

const primary = { breakfast: [], snack: [], lunch: [] }
for (const r of NUTRITION_RECIPE_CATALOG) {
  primary[primaryBucket(r)].push(r)
}

const dateStr = new Date().toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

let n = 0
function recipeHtml(r) {
  n += 1
  const steps = (r.steps ?? [])
    .map((s, i) => `<li><span class="n">${i + 1}.</span> ${escapeHtml(s)}</li>`)
    .join('')
  return `<article class="recipe">
    <h3><span class="num">${n}.</span> ${escapeHtml(r.label)}</h3>
    <p class="meta">${escapeHtml(slotsLabel(r.slotKinds))}</p>
    <p class="parts"><strong>Состав:</strong> ${escapeHtml(partsLine(r.parts))}</p>
    <ol class="steps">${steps}</ol>
  </article>`
}

const body = [
  { title: 'Завтрак', list: primary.breakfast },
  { title: 'Перекус', list: primary.snack },
  { title: 'Обед и ужин', list: primary.lunch },
]
  .map((sec) => {
    if (!sec.list.length) return ''
    return `<section>
      <h2>${escapeHtml(sec.title)} <small>${sec.list.length}</small></h2>
      ${sec.list.map(recipeHtml).join('')}
    </section>`
  })
  .join('')

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<title>Книга рецептов — Ядро</title>
<style>
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: #1a1a1a;
  font-size: 10.5pt;
  line-height: 1.45;
}
.cover {
  text-align: center;
  padding: 40mm 10mm 20mm;
  page-break-after: always;
}
.cover .brand {
  font-size: 13pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 12mm;
}
.cover h1 {
  font-size: 28pt;
  font-weight: 700;
  margin: 0 0 6mm;
  letter-spacing: -0.02em;
}
.cover p { color: #444; max-width: 420px; margin: 0 auto 4mm; }
.cover .meta { margin-top: 16mm; font-size: 10pt; color: #777; }
h2 {
  font-size: 16pt;
  margin: 0 0 6mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid #1a1a1a;
  page-break-after: avoid;
}
h2 small { font-weight: 500; color: #888; font-size: 11pt; }
section { margin-bottom: 10mm; }
.recipe {
  margin-bottom: 7mm;
  padding-bottom: 5mm;
  border-bottom: 1px solid #e5e5e5;
  page-break-inside: avoid;
}
.recipe:last-child { border-bottom: none; }
h3 { font-size: 12.5pt; margin: 0 0 1.5mm; }
h3 .num { color: #888; font-weight: 600; }
.meta { margin: 0 0 2mm; font-size: 9pt; color: #666; }
.parts { margin: 0 0 3mm; font-size: 9.5pt; color: #333; }
.steps { margin: 0; padding-left: 0; list-style: none; }
.steps li { margin: 0 0 1.5mm; }
.steps .n { color: #888; font-weight: 600; margin-right: 2px; }
.footer-note {
  margin-top: 8mm;
  font-size: 8.5pt;
  color: #888;
  text-align: center;
}
</style>
</head>
<body>
<div class="cover">
  <div class="brand">Ядро · Fitness Diary</div>
  <h1>Книга рецептов</h1>
  <p>Простые блюда с полки «Пятёрочки» и «Магнита». Для рациона тренера и клиента.</p>
  <p class="meta">${escapeHtml(dateStr)} · ${NUTRITION_RECIPE_CATALOG.length} рецептов</p>
</div>
${body}
<p class="footer-note">Доли в составе — ориентир для сборки рациона; точные граммы считает план в приложении.</p>
</body>
</html>`

const desktop = join(homedir(), 'OneDrive', 'Desktop')
const desktopFallback = join(homedir(), 'Desktop')
const outDir = existsSync(desktop) ? desktop : desktopFallback
const pdfPath = join(outDir, 'Книга рецептов Ядро.pdf')
const htmlPath = join(tmpdir(), 'yadro-nutrition-recipes.html')
writeFileSync(htmlPath, html, 'utf8')

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browser = chromeCandidates.find((p) => existsSync(p))
if (!browser) {
  console.error('Не найден Chrome/Edge для печати PDF')
  process.exit(1)
}

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/')
const r = spawnSync(
  browser,
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, fileUrl],
  { encoding: 'utf8', timeout: 90_000 },
)

if (r.status !== 0 || !existsSync(pdfPath)) {
  console.error(r.stderr || r.stdout || 'Не удалось создать PDF')
  process.exit(1)
}

console.log(`OK: ${pdfPath}`)
console.log(`Рецептов: ${NUTRITION_RECIPE_CATALOG.length}`)
