ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS enable_dark_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_anti_cheat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_tab_switches integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS enable_fullscreen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_copy boolean NOT NULL DEFAULT false;
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS tab_switch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cheat_terminated boolean NOT NULL DEFAULT false;
ALTER TABLE public.access_keys
  ADD COLUMN IF NOT EXISTS tab_switch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cheat_terminated boolean NOT NULL DEFAULT false;