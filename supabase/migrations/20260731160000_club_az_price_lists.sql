-- Прайс АЗ клуба (отдельно от ПЗ/ТЗ).
CREATE TABLE IF NOT EXISTS public.club_az_price_lists (
  club_id UUID PRIMARY KEY REFERENCES public.clubs (id) ON DELETE CASCADE,
  valid_from DATE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_directions JSONB NOT NULL DEFAULT '[]'::jsonb,
  class_directions JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_counts JSONB NOT NULL DEFAULT '[]'::jsonb,
  cells JSONB NOT NULL DEFAULT '{}'::jsonb,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_club_az_price_lists_updated
  ON public.club_az_price_lists (updated_at DESC);

ALTER TABLE public.club_az_price_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_club_az_price_lists_admin ON public.club_az_price_lists;
CREATE POLICY fit_club_az_price_lists_admin
  ON public.club_az_price_lists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(trim(coalesce(u.role, ''))) IN ('admin', 'app_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(trim(coalesce(u.role, ''))) IN ('admin', 'app_admin')
    )
  );

DROP POLICY IF EXISTS fit_club_az_price_lists_sales_manager_read ON public.club_az_price_lists;
CREATE POLICY fit_club_az_price_lists_sales_manager_read
  ON public.club_az_price_lists
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(trim(coalesce(u.role, ''))) = 'sales_manager'
        AND u.club_id = club_az_price_lists.club_id
    )
  );

-- Менеджер своего клуба может писать (как ПЗ).
DROP POLICY IF EXISTS fit_club_az_price_lists_sales_manager_write ON public.club_az_price_lists;
CREATE POLICY fit_club_az_price_lists_sales_manager_write
  ON public.club_az_price_lists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(trim(coalesce(u.role, ''))) = 'sales_manager'
        AND u.club_id = club_az_price_lists.club_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(trim(coalesce(u.role, ''))) = 'sales_manager'
        AND u.club_id = club_az_price_lists.club_id
    )
  );
