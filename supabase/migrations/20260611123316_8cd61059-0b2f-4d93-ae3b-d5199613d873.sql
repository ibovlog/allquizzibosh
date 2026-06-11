DROP POLICY IF EXISTS "Anyone can submit a result" ON public.quiz_results;
REVOKE INSERT ON public.quiz_results FROM anon;