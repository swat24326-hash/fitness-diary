/**
 * Стенд C2: очистить пустую схему public, чтобы db:migrate:pg --with-policies прошёл с нуля
 * (policies.sql до миграций). Отказ, если хоть в одной таблице есть строки. Схема auth (стаб) и расширения остаются.
 * Usage (на ВМ): sudo bash scripts/r2-vm-db-run.sh scripts/pg-reset-empty-schema.mjs --yes-empty-staging
 */
import pg from 'pg'
import { quoteIdent } from '../api/_lib/pgRest/ident.js'
import { pgClientSslOption, pgResetGuardError } from '../src/lib/pgMigrateOrderCore.js'

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) {
    console.error('Задайте DATABASE_URL (Managed PG стенда).')
    process.exit(1)
  }
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_schema_migrations'`,
    )
    const nonEmptyTables = []
    for (const { relname } of rows) {
      const r = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quoteIdent(relname)}) AS has`)
      if (r.rows[0].has) nonEmptyTables.push(relname)
    }
    const guard = pgResetGuardError({ nonEmptyTables, argv: process.argv })
    if (guard) throw new Error(guard)

    // Схему целиком не роняем: pgcrypto включён из консоли Managed PG, заново создать его osapp не может.
    await client.query('BEGIN')
    const tables = await client.query(
      `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`,
    )
    for (const t of tables.rows) {
      const kind = t.relkind === 'v' ? 'VIEW' : t.relkind === 'm' ? 'MATERIALIZED VIEW' : 'TABLE'
      await client.query(`DROP ${kind} IF EXISTS public.${quoteIdent(t.relname)} CASCADE`)
    }
    const fns = await client.query(
      `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
    )
    for (const f of fns.rows) await client.query(`DROP ROUTINE IF EXISTS ${f.sig} CASCADE`)
    const types = await client.query(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c')
         AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')`,
    )
    for (const t of types.rows) await client.query(`DROP TYPE IF EXISTS public.${quoteIdent(t.typname)} CASCADE`)
    await client.query('COMMIT')
    console.log(
      `reset ok: public очищена (таблиц/представлений ${tables.rows.length}, функций ${fns.rows.length}, типов ${types.rows.length}); расширения не тронуты`,
    )
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
