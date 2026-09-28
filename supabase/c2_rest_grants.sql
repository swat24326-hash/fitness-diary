-- C2 / bare Postgres: права роли authenticated для /rest/v1 нашего сервера (браузер под RLS).
-- Прод Supabase это не применяет. Идемпотентно, переприменяется при каждом db:migrate:pg --with-policies,
-- чтобы новые таблицы из миграций получили права.
-- Правило: таблица с RLS — чтение и запись (решают политики); без RLS — только чтение,
-- иначе любой вошедший мог бы менять, например, users.role.

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t.relname);
    IF t.relname = '_schema_migrations' THEN
      CONTINUE;
    ELSIF t.relrowsecurity THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.relname);
    ELSE
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.relname);
    END IF;
  END LOOP;
END
$$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
