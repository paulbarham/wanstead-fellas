-- TEMPLATE family seed — REPLACE these with your travellers.
--
-- People with an email get their members row auto-created (with these names /
-- colours) the first time they open the app and sign in. Anyone with no device
-- is inserted directly as a managed member under a managing adult's email.

-- Sign-in roster (matched to auth.users by email, case-insensitive).
insert into public.member_seed (email, display_name, age_group, color) values
  ('you@example.com',     'You',     'adult', '#0e3a48'),
  ('partner@example.com', 'Partner', 'adult', '#4a8896'),
  ('child1@example.com',  'Child 1', 'teen',  '#e08853')
on conflict (email) do update
  set display_name = excluded.display_name,
      age_group    = excluded.age_group,
      color        = excluded.color;

-- Managed members (no device) under a managing adult's email. Insert once;
-- guarded by name so a re-run doesn't duplicate them.
insert into public.members (id, display_name, age_group, color, manager_email)
select gen_random_uuid(), 'Child 2', 'child', '#7a9e5e', 'you@example.com'
where not exists (select 1 from public.members where display_name = 'Child 2' and manager_email = 'you@example.com');
