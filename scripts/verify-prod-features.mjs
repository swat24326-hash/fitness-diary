const origin = 'https://fitness-diary-bice.vercel.app'
const html = await fetch(origin + '/').then((r) => r.text())
const m = html.match(/\/assets\/(index-[^"]+\.js)/)
if (!m) {
  console.error('no bundle')
  process.exit(1)
}
const t = await fetch(`${origin}/assets/${m[1]}`).then((r) => r.text())
console.log('bundle:', m[1])
const checks = [
  ['header sync', 'app-header__sync-btn'],
  ['sync done msg', 'Готово:'],
  ['admin cache prune msg', 'очищено кэша'],
  ['bulk upload', 'Быстрая загрузка'],
]
let fail = 0
for (const [name, s] of checks) {
  const ok = t.includes(s)
  console.log(ok ? '✓' : '✗', name)
  if (!ok) fail++
}
process.exit(fail ? 1 : 0)
