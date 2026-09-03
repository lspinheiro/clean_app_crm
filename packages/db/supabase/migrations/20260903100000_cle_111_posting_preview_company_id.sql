-- CLE-111: the posting preview identifies its company by id, not by display name.
--
-- `companies.name` has no uniqueness constraint, so a preview that returns only the name
-- leaves the cleaner join page unable to tell two same-named companies apart. It then
-- attributes the visitor's relationship — rejected, removed, staff — to the wrong company
-- and can suppress the apply control for a candidate the company has never heard of.
--
-- `company_id` discloses nothing new to `anon`: the same function already returns the
-- company name, and the id is an opaque UUID. Both cleaner views already expose it.
--
-- The return type changes, so the function has to be dropped rather than replaced, and its
-- grants have to be re-issued: the Supabase PG17 image grants nothing back automatically.

drop function public.posting_preview(text);

create function public.posting_preview(posting_code text)
returns table (
  state text,
  closing_reason text,
  company_id uuid,
  company_name text,
  intent public.posting_intent,
  public_description text,
  scheduled_start timestamptz,
  weekday smallint,
  local_start_time time without time zone,
  frequency public.recurrence_frequency,
  duration_minutes integer,
  service_name text,
  service_slug text,
  suburb text,
  cleaner_pay_cents integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_posting public.postings;
  dead_reason text;
begin
  select posting.*
  into target_posting
  from public.postings posting
  where posting.code = upper(btrim(posting_code));

  if not found then
    return query select
      'dead'::text, 'unknown'::text, null::uuid, null::text,
      null::public.posting_intent,
      null::text, null::timestamptz, null::smallint, null::time,
      null::public.recurrence_frequency, null::integer, null::text, null::text,
      null::text, null::integer;
    return;
  end if;

  dead_reason := public.posting_closing_reason(target_posting.id);
  if dead_reason is not null then
    return query select
      'dead'::text, dead_reason, null::uuid, null::text, target_posting.intent,
      null::text, null::timestamptz, null::smallint, null::time,
      null::public.recurrence_frequency, null::integer, null::text, null::text,
      null::text, null::integer;
    return;
  end if;

  return query
  select
    'active'::text,
    null::text,
    company.id,
    company.name,
    target_posting.intent,
    target_posting.public_description,
    job.scheduled_start,
    rule.weekday,
    rule.local_start_time,
    rule.frequency,
    coalesce(job.duration_minutes, rule.duration_minutes),
    service.name,
    service.slug,
    site.suburb,
    coalesce(job.cleaner_pay_cents, rule.cleaner_pay_cents)
  from public.companies company
  left join public.jobs job on job.id = target_posting.job_id
  left join public.recurring_assignments rule
    on rule.id = target_posting.recurring_assignment_id
  left join public.sites site
    on site.id = coalesce(job.site_id, rule.site_id)
  left join public.service_catalogue service
    on service.id = coalesce(job.service_id, rule.service_id)
  where company.id = target_posting.company_id;
end;
$$;

revoke all on function public.posting_preview(text) from public;
grant execute on function public.posting_preview(text)
to anon, authenticated, service_role;
