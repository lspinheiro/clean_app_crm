-- Existing installations may already contain CLE-14 rules. Materialise their
-- initial horizon without resetting or replacing any manually scheduled jobs.
select public.generate_recurring_jobs();
