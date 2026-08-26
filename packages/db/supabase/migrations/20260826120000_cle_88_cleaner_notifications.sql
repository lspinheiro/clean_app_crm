-- CLE-88. A notification row carries only `job_id`, so a cleaner cannot render a useful
-- list from it. She also cannot join her way to the details: `jobs_select_admin` and
-- `sites_select_admin` both gate on `is_company_admin`, so the embedded join the CRM's
-- bell uses returns nothing for her.
--
-- The delivered cleaner views cannot stand in either. `cleaner_job_board` drops a job the
-- moment its slot is filled, and `cleaner_my_jobs` drops it when the assignment ends —
-- which is exactly the history a notification list exists to explain ("this job was
-- cancelled"). So this is a peer view over notifications, reading with the owner's rights
-- like its siblings.
--
-- The projection is the same field set the push payload already sends: service, site name,
-- suburb, start. The street address and the access notes stay behind
-- `get_cleaner_job_access()`, which logs every disclosure — a read-only view cannot audit,
-- so those fields must never appear here.
create view public.cleaner_notifications
with (security_invoker = false, security_barrier = true)
as
select
  notification.id as notification_id,
  notification.job_id,
  notification.type,
  notification.read_at,
  notification.created_at,
  company.name as company_name,
  site.name as site_name,
  site.suburb,
  service.name as service_name,
  service.slug as service_slug,
  job.scheduled_start
from public.notifications notification
join public.jobs job on job.id = notification.job_id
join public.sites site on site.id = job.site_id
join public.clients client on client.id = site.client_id
join public.companies company on company.id = client.company_id
join public.service_catalogue service on service.id = job.service_id
where notification.recipient_id = auth.uid()
  -- `application_received` is addressed to company employees. One account can hold an
  -- employee membership and also work as a cleaner for the same company, so narrowing by
  -- recipient alone would leak it into her list: the kind has to decide, not the account.
  and notification.type in (
    'job_assigned',
    'job_posted',
    'job_cancelled',
    'payment_marked_paid'
  );

revoke all on table public.cleaner_notifications from public, anon, authenticated;
grant select on table public.cleaner_notifications to authenticated, service_role;
