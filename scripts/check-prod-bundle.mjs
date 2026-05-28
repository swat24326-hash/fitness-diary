import https from 'https'

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'user-agent': 'fitness-diary-check/1.0',
          accept: 'text/html,application/javascript',
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.setTimeout(30_000, () => {
      req.destroy(new Error('timeout'))
    })
  })
}

const ORIGIN = 'https://fitness-diary-bice.vercel.app'

async function main() {
  const home = await get(`${ORIGIN}/`)
  console.log('home.status', home.status)
  console.log('home.cache-control', home.headers['cache-control'] ?? '')

  const m = home.body.match(/"(?<path>\/assets\/index-[^"]+\.js)"/)
  if (!m?.groups?.path) {
    console.log('index.js not found in HTML')
    process.exit(2)
  }

  const jsPath = m.groups.path
  const jsUrl = `${ORIGIN}${jsPath}`
  console.log('bundle', jsUrl)

  const js = await get(jsUrl)
  console.log('bundle.status', js.status)
  console.log('bundle.cache-control', js.headers['cache-control'] ?? '')
  console.log('bundle.etag', js.headers.etag ?? '')
  console.log('bundle.len', js.body.length)

  const hasGroupId = js.body.includes('exercise-catalog-group')
  const hasLabel = js.body.includes('Направленность')
  console.log('has.exercise-catalog-group', hasGroupId)
  console.log('has.Направленность', hasLabel)

  process.exit(hasGroupId && hasLabel ? 0 : 3)
}

main().catch((e) => {
  console.error('error', e?.message ?? e)
  process.exit(1)
})
