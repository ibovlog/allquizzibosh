DROP POLICY IF EXISTS "Anyone can read access keys" ON public.access_keys;
DROP POLICY IF EXISTS "Anyone can read processing errors" ON public.processing_errors;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.access_keys FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.processing_errors FROM authenticated;