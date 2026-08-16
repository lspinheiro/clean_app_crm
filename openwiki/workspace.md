---
type: Workspace reference
title: pnpm Workspace and Development Surface
description: The repository is a private pnpm workspace with executable CRM and Supabase database packages. This page records root routing scripts, package-owned commands, generated-type workflow, and focused versus broad validation.
tags: [workspace, pnpm, tooling, validation]
openwiki:
  roles: [repository, testing]
  source_paths: [package.json, apps/crm/package.json, packages/db/package.json, scripts/run-local-dev.mjs]
  validation_commands: [pnpm test:vocabulary, pnpm test:dev-setup, pnpm check]
---

# pnpm Workspace and Development Surface

## Workspace layout

The root `package.json` defines private package `clean-app-crm`, Node `>=20`, and `pnpm@9.15.3`; `pnpm-workspace.yaml` discovers `apps/*` and `packages/*`. `apps/crm` is a Next.js application named `crm`; `packages/db` is the `@clean-app/db` Supabase CLI and generated-type package. [Architecture](architecture/overview.md) explains their runtime relationship.

| Command | Owner and purpose | Use it when |
|---|---|---|
| `pnpm crm <command>` | Root alias for `pnpm --filter crm`; CRM scripts include `dev`, `build`, `lint`, `typecheck`, `test:run`, and `test:e2e`. | Running or validating CRM work. |
| `pnpm db:start`, `pnpm db:stop`, `pnpm db:reset` | Root aliases for the `@clean-app/db` local Supabase lifecycle. | Local database lifecycle work; Docker is required. |
| `pnpm db:test` | Runs SQL tests and all registered Node concurrency probes through `packages/db/scripts/test-local.mjs`. | Migrations, RPCs, RLS/grants, seed, or concurrency changes. |
| `pnpm crm db:types` | Forwards to the database package and generates `packages/db/src/database.types.ts` from the local public schema. | A database schema/type contract changes. |
| `pnpm test` | Runs CRM Vitest in non-watch mode. | Broad CRM regression validation, after focused tests. |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | CRM lint, route-aware type check, and production build. | Respectively lint/type/build boundaries change. |
| `pnpm test:dev-setup` | Executes `scripts/run-local-dev.test.mjs`. | Editing the local launcher or its setup behaviour. |
| `pnpm test:vocabulary` | Executes `scripts/check-vocabulary.mjs`. | Product-facing vocabulary is changed. |
| `pnpm check` | Vocabulary + launcher + CRM tests + database tests + lint + typecheck + build. | Conditional whole-surface gate, not ordinary focused validation. |

## Local development and boundaries

`pnpm crm dev` runs `scripts/run-local-dev.mjs` through the CRM package. The README describes its role: start/reuse local Supabase, apply pending migrations without resetting existing data, load a configured demo seed on a fresh volume, and start the CRM. Database commands are package-owned and forwarded by CRM scripts as well as root aliases.

Do not read or commit `.env*` files. `apps/crm/.env.local` is for optional local overrides; setup documentation and examples must contain placeholders only. The local seed is demo-only and must not become production credentials or real client data.

`packages/db/src/database.types.ts` is generated. The canonical source is migration SQL, not the generated file. A schema change crosses the [data contract](architecture/data-and-security.md): generate types with `pnpm crm db:types` (or the package-owned `pnpm --dir packages/db db:types`), update the CRM consumer where needed, then typecheck the consumer import path.

## Focused validation guidance

Use the smallest check that exercises the changed boundary:

- CRM action/model/schema test: `pnpm --filter crm test:run -- <relative-test-path>`.
- Database migration/RPC/RLS/seed: `pnpm db:test` (requires Docker/local Supabase).
- Changed generated schema contract: `pnpm crm db:types && pnpm --filter crm typecheck`.
- Local development launcher: `pnpm test:dev-setup`.
- Vocabulary-only content: `pnpm test:vocabulary`.

`pnpm check`, E2E tests, and the production build are intentionally broader. Run them when a change crosses multiple package/runtime boundaries, changes a release-facing route/build contract, or the task explicitly requires whole-repository confidence. Do not use them by default for a single component or SQL assertion change.
