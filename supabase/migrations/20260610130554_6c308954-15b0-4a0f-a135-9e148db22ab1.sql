ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS shuffle_options boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.access_keys
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS blank_count integer,
  ADD COLUMN IF NOT EXISTS access_key text;

CREATE TABLE IF NOT EXISTS public.problem_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  question_id uuid,
  pdf_number integer,
  question_text text,
  seat_number integer,
  access_key text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.problem_reports TO authenticated;
GRANT ALL ON public.problem_reports TO service_role;

ALTER TABLE public.problem_reports ENABLE ROW LEVEL SECURITY;