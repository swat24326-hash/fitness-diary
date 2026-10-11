-- Вход значка iPhone в приложение тренера: у значка «Домой» своё хранилище, сессия Safari туда не переходит.
-- Safari уже вошедшего телефона берёт одноразовый вход для значка (kind = 'handoff', device_id — этот же телефон);
-- QR с планшета — kind = 'qr'. Виды не взаимозаменяемы: QR не выдаёт вход чужого телефона, handoff не закрепляет новый.

ALTER TABLE public.coach_invites
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'qr';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_invites_kind_check') THEN
    ALTER TABLE public.coach_invites
      ADD CONSTRAINT coach_invites_kind_check CHECK (kind IN ('qr', 'handoff'));
  END IF;
END $$;
