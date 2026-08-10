-- Длиннее названия типов карт (ПЗ/АЗ): было ≤12, нужно для «Воздушная растяжка» и т.п.

ALTER TABLE public.membership_types
  DROP CONSTRAINT IF EXISTS membership_types_code_len;

ALTER TABLE public.membership_types
  ADD CONSTRAINT membership_types_code_len
  CHECK (char_length(trim(code)) >= 1 AND char_length(trim(code)) <= 40);

COMMENT ON CONSTRAINT membership_types_code_len ON public.membership_types IS
  'Название типа карты: 1–40 символов после trim';
