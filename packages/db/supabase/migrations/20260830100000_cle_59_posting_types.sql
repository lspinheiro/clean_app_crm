create type public.posting_intent as enum (
  'expression_of_interest',
  'one_time',
  'regular'
);

create type public.join_request_state as enum (
  'waiting',
  'admitted',
  'rejected'
);

alter type public.application_status add value 'hired';
alter type public.application_status add value 'job_filled';
alter type public.application_status add value 'posting_closed';

alter type public.notification_type add value 'hired';
alter type public.notification_type add value 'admitted';
alter type public.notification_type add value 'rejected';
