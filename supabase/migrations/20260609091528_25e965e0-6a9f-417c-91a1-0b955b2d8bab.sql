-- assessments: login modes, seat range, resume option
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS login_mode text NOT NULL DEFAULT 'seat',
  ADD COLUMN IF NOT EXISTS seat_min integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seat_max integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS resume_after_unblock boolean NOT NULL DEFAULT true;

-- questions: original PDF number + source file
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS pdf_number integer,
  ADD COLUMN IF NOT EXISTS source_file text;

-- participants: access key + saved progress
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS access_key text,
  ADD COLUMN IF NOT EXISTS current_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;

-- quiz_results: detailed report
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS details jsonb;

-- access_keys table
CREATE TABLE IF NOT EXISTS public.access_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  key_code text NOT NULL,
  device_id text,
  blocked boolean NOT NULL DEFAULT false,
  current_index integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, key_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_keys TO authenticated;
GRANT ALL ON public.access_keys TO service_role;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read access keys" ON public.access_keys FOR SELECT TO public USING (true);

-- processing_errors table
CREATE TABLE IF NOT EXISTS public.processing_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE,
  file_name text,
  question_number integer,
  reason text NOT NULL,
  raw_excerpt text,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_errors TO authenticated;
GRANT ALL ON public.processing_errors TO service_role;
ALTER TABLE public.processing_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read processing errors" ON public.processing_errors FOR SELECT TO public USING (true);

-- realtime for participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;