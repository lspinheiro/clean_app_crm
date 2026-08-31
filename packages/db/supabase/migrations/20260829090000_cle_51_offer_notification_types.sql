create type public.offer_status as enum (
  'pending',
  'accepted',
  'declined',
  'revoked'
);

alter type public.notification_type add value 'offer_received';
alter type public.notification_type add value 'offer_declined';
alter type public.notification_type add value 'job_paid';
