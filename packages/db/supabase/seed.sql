-- Local demo data only. Every account uses password: local-demo-only
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  fixture.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  fixture.email,
  extensions.crypt('local-demo-only', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', fixture.full_name),
  now(), now(), '', '', '', ''
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'admin@clean-app.example.test', 'Demo Company Admin'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'cleaner.one@clean-app.example.test', 'Demo Cleaner One'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'cleaner.two@clean-app.example.test', 'Demo Cleaner Two'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'cleaner.three@clean-app.example.test', 'Demo Cleaner Three'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'removed.cleaner@clean-app.example.test', 'Demo Removed Cleaner')
) as fixture(id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  ('11000000-0000-4000-8000-00000000000' || row_number() over (order by id))::uuid,
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email', id::text, now(), now(), now()
from auth.users
where email like '%@clean-app.example.test'
on conflict (provider_id, provider) do nothing;

update public.profiles
set role = 'company_admin'
where id = '10000000-0000-4000-8000-000000000001';

insert into public.companies (id, name, abn, status)
values (
  '10000000-0000-4000-8000-000000000010',
  'Coastal Demo Cleaning',
  '51824753556',
  'approved'
)
on conflict (id) do nothing;

insert into public.company_members (id, company_id, profile_id, status, joined_at)
values
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'active', '2026-08-01T00:00:00+10'),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'active', '2026-08-02T00:00:00+10'),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000003', 'active', '2026-08-03T00:00:00+10'),
  ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'active', '2026-08-04T00:00:00+10'),
  ('10000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000005', 'removed', '2026-08-05T00:00:00+10')
on conflict (company_id, profile_id) do nothing;

insert into public.company_invites (id, company_id, code)
values (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000010',
  'CLEAN1'
)
on conflict (id) do nothing;

-- A superseded link, so the cleaner app's "no longer in use" state has a fixture that no
-- other suite has to rotate the live code away to produce.
insert into public.company_invites (id, company_id, code, revoked_at)
values (
  '10000000-0000-4000-8000-000000000202',
  '10000000-0000-4000-8000-000000000010',
  'ZOLD01',
  '2026-08-01T00:00:00+10'
)
on conflict (id) do nothing;

insert into public.clients (
  id,
  company_id,
  name,
  contact_name,
  phone,
  notes
)
values
  (
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000010',
    'Oceanview Property Group',
    'Morgan Ellis',
    '07 5555 0101',
    'Local multi-site demo client'
  ),
  (
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000010',
    'Palm Grove Dental',
    'Riley Chen',
    '07 5555 0102',
    'Local single-site demo client'
  )
on conflict (id) do nothing;

insert into public.sites (
  id,
  client_id,
  name,
  address,
  suburb,
  access_notes
)
values
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000301',
    'Broadbeach Towers',
    '10 Surf Parade',
    'Broadbeach',
    'Demo access notes — company admin only'
  ),
  (
    '10000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000301',
    'Southport Office',
    '45 Nerang Street',
    'Southport',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000403',
    '10000000-0000-4000-8000-000000000301',
    'Burleigh Retail',
    '88 James Street',
    'Burleigh Heads',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000404',
    '10000000-0000-4000-8000-000000000302',
    'Palm Grove Practice',
    '21 Robina Town Centre Drive',
    'Robina',
    null
  )
on conflict (id) do nothing;

update public.sites
set
  default_service_id = '30000000-0000-4000-8000-000000000002',
  default_duration_minutes = case
    when id = '10000000-0000-4000-8000-000000000404' then 90
    else 120
  end,
  default_rate_cents = case
    when id = '10000000-0000-4000-8000-000000000404' then 12500
    else 15000
  end
where id in (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000402',
  '10000000-0000-4000-8000-000000000403',
  '10000000-0000-4000-8000-000000000404'
);

insert into public.site_preferred_cleaners (site_id, cleaner_id, rank)
values
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000002',
    1
  ),
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000003',
    2
  ),
  (
    '10000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000003',
    1
  )
on conflict (site_id, cleaner_id) do update
set rank = excluded.rank;

insert into public.recurring_assignments (
  id,
  site_id,
  service_id,
  frequency,
  weekday,
  anchor_date,
  local_start_time,
  duration_minutes,
  cleaner_pay_cents,
  crew_size,
  active
)
values
  (
    '10000000-0000-4000-8000-000000000701',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly',
    1,
    date_trunc('week', timezone('Australia/Brisbane', now()))::date,
    '08:00',
    120,
    12000,
    2,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    '10000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000001',
    'fortnightly',
    2,
    date_trunc('week', timezone('Australia/Brisbane', now()))::date + 1,
    '17:30',
    90,
    9500,
    1,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000703',
    '10000000-0000-4000-8000-000000000404',
    '30000000-0000-4000-8000-000000000002',
    'weekly',
    4,
    date_trunc('week', timezone('Australia/Brisbane', now()))::date + 3,
    '06:00',
    90,
    9000,
    1,
    true
  )
on conflict (id) do update
set
  site_id = excluded.site_id,
  service_id = excluded.service_id,
  frequency = excluded.frequency,
  weekday = excluded.weekday,
  anchor_date = excluded.anchor_date,
  local_start_time = excluded.local_start_time,
  duration_minutes = excluded.duration_minutes,
  cleaner_pay_cents = excluded.cleaner_pay_cents,
  crew_size = excluded.crew_size,
  active = excluded.active;

insert into public.recurring_assignment_cleaners (
  recurring_assignment_id,
  slot_number,
  cleaner_id
)
values
  (
    '10000000-0000-4000-8000-000000000701',
    1,
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    1,
    '10000000-0000-4000-8000-000000000003'
  )
on conflict (recurring_assignment_id, slot_number) do update
set cleaner_id = excluded.cleaner_id;

-- Jobs are generated from the recurring rules so fresh demo databases exercise
-- the same 28-day roster path as production data.
select public.generate_recurring_jobs();
