/**
 * R3 (ночь переезда): пароли сотрудников из Supabase Auth → users.password_hash в Managed PG.
 * Сотрудники входят со старыми паролями; при первом входе сервер пересохранит их в scrypt.
 *
 * 1. Supabase SQL Editor: select id, email, encrypted_password from auth.users; → скачать CSV/JSON.
 * 2. Файл на ВМ (0600), затем:
 *    sudo bash scripts/r2-vm-db-run.sh scripts/r3-import-auth-hashes.mjs /path/export.csv          # показать план
 *    sudo bash scripts/r2-vm-db-run.sh scripts/r3-import-auth-hashes.mjs /path/export.csv --apply  # записать
 * 3. Файл выгрузки удалить: в нём хеши паролей.
 * В stdout — только числа и логины, без хешей и почт.
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { parseAuthExport, planAuthHashImport } from '../api/_lib/authHashImportCore.js'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!file) throw new Error('Укажите файл выгрузки auth.users (CSV или JSON).')
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) throw new Error('Задайте DATABASE_URL (Managed PG).')

  const authRows = parseAuthExport(readFileSync(file, 'utf8'))
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    const { rows: users } = await client.query('SELECT id::text AS id, email, login, password_hash FROM public.users')
    const plan = planAuthHashImport(authRows, users)
    const viaEmail = plan.updates.filter((u) => u.via === 'email').length
    console.log(`в выгрузке: ${authRows.length}; без пароля/не bcrypt: ${plan.noHash}; не найдены среди сотрудников: ${plan.unmatchedAuth.length}`)
    console.log(`к переносу: ${plan.updates.length} (по почте: ${viaEmail}); уже свой пароль, не трогаем: ${plan.keptOwn}`)
    if (plan.staffWithoutPassword.length) {
      console.log(`сотрудники без пароля после переноса (нужно задать вручную): ${plan.staffWithoutPassword.join(', ')}`)
    }
    if (!apply) {
      console.log('план показан, база не менялась; для записи добавьте --apply')
      return
    }
    await client.query('BEGIN')
    try {
      for (const u of plan.updates) {
        await client.query('UPDATE public.users SET password_hash = $1 WHERE id = $2', [u.passwordHash, u.userId])
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
    console.log(`записано: ${plan.updates.length}`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
