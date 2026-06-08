
-- Update timestamp helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- =================== assessments ===================
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  question_count INTEGER NOT NULL DEFAULT 20,
  order_mode TEXT NOT NULL DEFAULT 'random',
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessments TO anon, authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read assessments" ON public.assessments FOR SELECT USING (true);

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- default assessment for existing questions
INSERT INTO public.assessments (name, description) VALUES ('Ümumi', 'Köçürülmüş suallar');

-- =================== questions.assessment_id ===================
ALTER TABLE public.questions ADD COLUMN assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE;
UPDATE public.questions SET assessment_id = (SELECT id FROM public.assessments WHERE name = 'Ümumi' LIMIT 1);
ALTER TABLE public.questions ALTER COLUMN assessment_id SET NOT NULL;
CREATE INDEX idx_questions_assessment ON public.questions(assessment_id);

-- =================== participants ===================
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL,
  device_id TEXT,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, seat_number)
);

GRANT SELECT ON public.participants TO anon, authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read participants" ON public.participants FOR SELECT USING (true);

CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================== admin_messages ===================
CREATE TABLE public.admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE,
  seat_number INTEGER,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_messages TO anon, authenticated;
GRANT ALL ON public.admin_messages TO service_role;
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read admin messages" ON public.admin_messages FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_messages;

-- =================== quiz_results.assessment_id ===================
ALTER TABLE public.quiz_results ADD COLUMN assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE;
CREATE INDEX idx_results_assessment ON public.quiz_results(assessment_id);
