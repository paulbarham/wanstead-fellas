-- Widen fitness_sessions.source check constraint so file-upload sessions
-- can be saved. The TCX/GPX parser writes 'tcx_upload' / 'gpx_upload' but
-- the original constraint only allowed 'polar' / 'strava' / 'manual', so
-- every file import failed at insert time with a check-constraint violation.

alter table public.fitness_sessions
  drop constraint if exists fitness_sessions_source_check;

alter table public.fitness_sessions
  add constraint fitness_sessions_source_check
  check (source = any (array[
    'manual'::text,
    'polar'::text,
    'strava'::text,
    'tcx_upload'::text,
    'gpx_upload'::text
  ]));
