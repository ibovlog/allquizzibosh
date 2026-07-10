-- 1. Courses (tenants)
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  logo_url text,
  primary_color text,
  login_title text,
  login_subtitle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses TO anon, authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read courses" ON public.courses FOR SELECT USING (true);

-- 2. Course admins
CREATE TABLE public.course_admins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- No anon/authenticated grants: managed only by server (service_role).
GRANT ALL ON public.course_admins TO service_role;
ALTER TABLE public.course_admins ENABLE ROW LEVEL SECURITY;
-- No policies => locked to all non-service roles.

-- 3. Seed a default course and backfill existing data
INSERT INTO public.courses (name, slug) VALUES ('Default', 'default');

-- 4. Add course_id to existing tables (nullable first, then backfill, then enforce)
ALTER TABLE public.assessments ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.questions ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.participants ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.access_keys ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.quiz_results ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.problem_reports ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.processing_errors ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.admin_messages ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;

UPDATE public.assessments SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.questions SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.participants SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.access_keys SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.quiz_results SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.problem_reports SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.processing_errors SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;
UPDATE public.admin_messages SET course_id = (SELECT id FROM public.courses WHERE slug='default') WHERE course_id IS NULL;

CREATE INDEX idx_assessments_course ON public.assessments(course_id);
CREATE INDEX idx_questions_course ON public.questions(course_id);
CREATE INDEX idx_participants_course ON public.participants(course_id);
CREATE INDEX idx_access_keys_course ON public.access_keys(course_id);
CREATE INDEX idx_quiz_results_course ON public.quiz_results(course_id);
CREATE INDEX idx_problem_reports_course ON public.problem_reports(course_id);
CREATE INDEX idx_processing_errors_course ON public.processing_errors(course_id);
CREATE INDEX idx_admin_messages_course ON public.admin_messages(course_id);

-- 5. updated_at trigger for new tables
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_course_admins_updated_at BEFORE UPDATE ON public.course_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();