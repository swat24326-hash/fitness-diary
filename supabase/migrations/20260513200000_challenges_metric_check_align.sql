-- Метрики челленджа: как в приложении (CHALLENGE_METRICS + устаревшие для старых строк).

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_metric_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_metric_check CHECK (
    metric IN (
      'max_weight',
      'max_reps',
      'max_time_sec',
      'max_distance_m',
      'max_rpe',
      'max_points'
    )
  );
