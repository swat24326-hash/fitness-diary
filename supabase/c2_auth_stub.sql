-- Stub схемы auth.* для bare Postgres (Yandex Managed PG / C2).
-- Нужен, чтобы schema + migrations с REFERENCES auth.users / auth.uid() / TO authenticated
-- применялись без настоящего Supabase Auth. На C2 данные идут через наш API — RLS не опора.
-- Идемпотентно: безопасно вызывать перед каждым db:migrate:pg.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Managed PG (Yandex) не даёт CREATE ROLE владельцу БД: роли заводят в консоли как
-- пользователей без доступа к базам. BYPASSRLS не нужен — API ходит владельцем таблиц.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated', 'anon', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('CREATE ROLE %I NOLOGIN', r);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'Нет роли % и права CREATE ROLE. Создайте в консоли кластера пользователей authenticated, anon, service_role (без доступа к базам) и повторите.', r;
      END;
    END IF;
  END LOOP;
END
$$;
