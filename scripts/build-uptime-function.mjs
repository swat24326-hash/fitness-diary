/**
 * Собрать внешнюю проверку (ops/uptime-function) в один CommonJS-файл для редактора Yandex Cloud Functions:
 * ops/uptime-function/dist/index.js, точка входа index.handler, среда Node.js 22.
 * Usage: node scripts/build-uptime-function.mjs
 */
import { build } from 'esbuild'

const out = 'ops/uptime-function/dist/index.js'
const result = await build({
  entryPoints: ['ops/uptime-function/index.mjs'],
  outfile: out,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  legalComments: 'none',
  metafile: true,
})
console.log(`${out}: ${result.metafile.outputs[out].bytes} байт`)
