-- SparkBrief ИСКРЫ: утренний бриф при открытии панели.

ALTER TABLE public.club_iskra_settings
  ADD COLUMN IF NOT EXISTS spark_brief_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.club_iskra_settings.spark_brief_enabled IS
  'Показывать утренний SparkBrief при открытии ИСКРЫ.';
