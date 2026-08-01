-- The Barham family roster.
--
-- PRIVACY: the real sign-in emails are applied directly to the live database
-- and are intentionally NOT committed here — the placeholders below just
-- document the shape. (If you ever re-provision from scratch, swap in the real
-- emails.) The four with an email get their members row auto-created on first
-- sign-in; the no-device members are inserted directly as managed members under
-- a managing adult's email.

-- Sign-in roster (matched to auth.users by email, case-insensitive).
insert into public.member_seed (email, display_name, age_group, color) values
  ('adult1@example.com',          'Paul',    'adult', '#0e3a48'),
  ('adult2@example.com',  'Nichola', 'adult', '#4a8896'),
  ('teen1@example.com',    'Amelia',  'teen',  '#e08853'),
  ('teen2@example.com', 'Marley',  'teen',  '#c86c3a')
on conflict (email) do update
  set display_name = excluded.display_name,
      age_group    = excluded.age_group,
      color        = excluded.color;

-- Managed members (no device) under Paul. Insert once; guarded by name so a
-- re-run doesn't duplicate them.
insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Tobias', 'child', '#7a9e5e', 'adult1@example.com'
where not exists (select 1 from public.members where display_name = 'Tobias' and manager_email = 'adult1@example.com');

insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Niyah', 'child', '#b5657e', 'adult1@example.com'
where not exists (select 1 from public.members where display_name = 'Niyah' and manager_email = 'adult1@example.com');
