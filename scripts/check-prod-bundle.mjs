const origin = 'https://fitness-diary-bice.vercel.app'
const html = await fetch(origin + '/').then((r) => r.text())
const m = html.match(/\/assets\/(index-[^"]+\.js)/)
if (!m) {
  console.log('no bundle in html')
  process.exit(1)
}
const url = `${origin}/assets/${m[1]}`
const body = await fetch(url).then((r) => r.text())
console.log('url:', url)
console.log('has OLD:', body.includes('Все клубы'))
console.log('has NEW:', body.includes('Выберите клуб'))
