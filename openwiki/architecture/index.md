# Files

- [CRM Runtime, Authentication, and Company Scope](crm-runtime.md) - The Next.js CRM uses App Router route groups, company-admin session enforcement, and company-scoped Supabase reads. Job mutations are server actions that validate input and hand critical state transitions to database RPCs.
- [Supabase Data, Security, and Generated Contract](data-and-security.md) - packages/db owns Supabase migrations, seed data, SQL regression tests, concurrency checks, and the generated Database type consumed by the CRM. Database RPCs enforce workflow mutations and data-access rules that application code cannot safely own.
- [Clean App CRM Architecture Overview](overview.md) - The repository is a pnpm monorepo with implemented Next.js CRM and cleaner applications plus a Supabase data package. This page maps their boundaries and routes changes to the canonical runtime, data, and workflow documentation.
