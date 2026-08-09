# Vacancy is a projection over unfilled crew slots, not a table (for now)

PRODUCT.md calls Vacancy "a core entity", and the obvious reading is a `vacancies` table.
In the alpha a vacancy is exactly an unfilled crew slot on an open job, so we expose it as
a database view (identity = job id + slot number) carrying site, time, duration, rate,
crew slot, and preferred-cleaner order. One state machine (jobs + slots) instead of two
kept in sync by triggers, and "producing a vacancy" cannot be forgotten — a slot becoming
unfilled *is* the vacancy. Nothing in the alpha reads durable per-vacancy state.

The first cycle that needs vacancy lifecycle state of its own — cascade progress,
share-link stats (MVP) — adds the table behind the same interface. Time-to-backfill
(cycle 2 instrumentation) is derivable from assignment-history timestamps and does not
require it. Do not "fix" the missing table before then.
