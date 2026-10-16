-- ОПЦИОНАЛЬНО — не входит в обычный деплой-миграций.
-- Проставить оферту всем уже существующим управляющим без клика «Принимаю».
-- Минус: слабее для спора, чем реальный клик. Версия = OFFER_VERSION в offerCore.js.
--
-- Перед запуском: колонки offer_* уже есть (миграция 20261104120000_users_offer_accepted.sql).

UPDATE public.users
SET
  offer_accepted_at = COALESCE(offer_accepted_at, now()),
  offer_version = COALESCE(NULLIF(trim(offer_version), ''), '2026-10-16')
WHERE lower(trim(role)) IN ('supervisor', 'управляющий')
  AND (
    offer_accepted_at IS NULL
    OR coalesce(offer_version, '') IS DISTINCT FROM '2026-10-16'
  );
