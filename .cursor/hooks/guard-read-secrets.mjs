/**
 * Хук beforeReadFile: не давать модели читать файлы с боевыми ключами.
 * Блокируем .env* (кроме примера) и любой файл, где нашёлся service role / серверный ключ.
 */

import { runHook } from './lib/hookIo.mjs'
import { findSecrets } from './lib/secretScan.mjs'

const ENV_FILE = /(^|[\\/])\.env(\.|$)/i
const ENV_ALLOWED = /\.env\.example$/i

runHook((input) => {
  const filePath = String(input.file_path || '')

  if (ENV_FILE.test(filePath) && !ENV_ALLOWED.test(filePath)) {
    return {
      permission: 'deny',
      user_message: 'Чтение .env заблокировано хуком: файл содержит боевые ключи. Нужные имена переменных — в .env.example.',
    }
  }

  const found = findSecrets(input.content)
  if (found.length > 0) {
    return {
      permission: 'deny',
      user_message: `Чтение ${filePath} заблокировано: в файле найден секрет (${found.join(', ')}). Уберите ключ из файла или смените его.`,
    }
  }

  return { permission: 'allow' }
}, { permission: 'allow' })
