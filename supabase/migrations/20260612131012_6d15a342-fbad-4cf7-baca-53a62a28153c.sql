-- 1. Questions: hide the correct answer column from public/anon readers.
-- Keep the readable RLS policy, but remove column-level access to correct_index.
REVOKE SELECT ON public.questions FROM anon, authenticated;
GRANT SELECT (id, assessment_id, prompt, options, position, pdf_number, source_file, created_at)
  ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;

-- 2. Participants: remove public read access. Answers, access_key, device_id and
-- progress must never be enumerable by anonymous users. The app only reads this
-- table through trusted server functions (service role) and uses polling for
-- block notifications, so no client read policy is required.
DROP POLICY IF EXISTS "Anyone can read participants" ON public.participants;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.participants FROM anon, authenticated;
GRANT ALL ON public.participants TO service_role;

-- 3. Access keys: ensure no client can read or mutate; only the service role.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.access_keys FROM anon, authenticated;
GRANT ALL ON public.access_keys TO service_role;

-- 4. Quiz results: results (scores, details, access_key) are server-written only.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.quiz_results FROM anon, authenticated;
GRANT ALL ON public.quiz_results TO service_role;