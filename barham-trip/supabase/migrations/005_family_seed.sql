-- The Barham family. Editable data, kept in git so the roster is reproducible.
--
-- The four with an email get their members row auto-created (with these names /
-- colours) the first time they open the app and request a magic link. Tobias &
-- Niyah have no device, so they're inserted directly as managed members under
-- Paul's email — Paul sets their day choices from his own login.

-- Sign-in roster (matched to auth.users by email, case-insensitive).
insert into public.member_seed (email, display_name, age_group, color) values
  ('pabarham@gmail.com',          'Paul',    'adult', '#0e3a48'),
  ('nicholaannbarham@gmail.com',  'Nichola', 'adult', '#4a8896'),
  ('ameliabarham39@gmail.com',    'Amelia',  'teen',  '#e08853'),
  ('marleyellisbarham@gmail.com', 'Marley',  'teen',  '#c86c3a')
on conflict (email) do update
  set display_name = excluded.display_name,
      age_group    = excluded.age_group,
      color        = excluded.color;

-- Managed members (no device) under Paul. Insert once; guarded by name so a
-- re-run doesn't duplicate them.
insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Tobias', 'child', '#7a9e5e', 'pabarham@gmail.com'
where not exists (select 1 from public.members where display_name = 'Tobias' and manager_email = 'pabarham@gmail.com');

insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Niyah', 'child', '#b5657e', 'pabarham@gmail.com'
where not exists (select 1 from public.members where display_name = 'Niyah' and manager_email = 'pabarham@gmail.com');
