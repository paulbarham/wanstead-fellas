-- Optional category on family-added "things to do" ideas, so they fold into the
-- same grouped view as the seed suggestions (sights, food, playgrounds, …).
-- Nullable — old rows and un-categorised ideas fall into the "More ideas" bucket.
alter table public.trip_ideas
  add column if not exists category text;
