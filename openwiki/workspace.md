---
type: workspace reference
title: pnpm Workspace and Development Surface
description: The current executable surface is a private pnpm workspace with root filter aliases and reserved app/package directories. This page records the supported commands, ownership boundaries, hygiene rules, and the absence of runnable product code.
tags: [workspace, pnpm, tooling, repository-hygiene]
---

# pnpm Workspace and Development Surface

## What can run today

The root `package.json` is the only package manifest. It declares a private package named `clean-app-crm`, Node `>=20`, and `pnpm@9.15.3`. The repository uses pnpm workspaces exclusively; `pnpm-workspace.yaml` discovers `apps/*` and `packages/*`.

| Root script | Expands to | Current result |
|---|---|---|
| `pnpm crm <command>` | `pnpm --filter crm <command>` | No `crm` package exists, so there is no script or application to run. |
| `pnpm cleaner <command>` | `pnpm --filter cleaner <command>` | No `cleaner` package exists, so there is no script or application to run. |
| `pnpm install` | Installs workspace dependencies | Valid workspace setup command; the present lockfile has only an empty root importer, so no app dependency graph is currently declared. |

The README lists aspirational commands such as `pnpm crm dev`, `pnpm crm build`, `pnpm crm db:start`, `pnpm crm db:reset`, and `pnpm crm db:types`. They are expected only after `apps/crm` and its scripts are created. Do not use their mention as evidence that a Next.js app or Supabase tooling is configured.

## Current workspace ownership

| Path | Intended owner | Present contents | What is absent |
|---|---|---|---|
| `/` | Workspace orchestration | root manifest, pnpm workspace file and lockfile | Application source, test runner configuration, shared package exports. |
| `apps/crm/` | Company-side CRM | Path is not created; intended ownership is documented in `README.md` and `AGENTS.md`. | Package manifest, App Router entrypoint, routes, components, environment example, tests. |
| `apps/cleaner/` | Future migrated cleaner app | Path is not created; intended ownership is documented in `README.md` and `AGENTS.md`. | Package manifest, routes, consumer interfaces, tests. |
| `packages/db/` | Future Supabase/shared data owner | Directory not created | Migrations, schema, SQL views/RPCs, seeds, type generation, contracts, tests. |
| `packages/ui/` | Future UI sharing owner | Directory not created | Package manifest, design tokens, component exports, consumer tests. |

The tree means there is no current import graph to preserve. [Present Architecture](architecture/overview.md) explains the proposed inter-package split, while [the domain model](product/domain-model.md) describes the product constraints future packages need to realise.

## Development rules that already apply

`AGENTS.md` establishes constraints for future development:

- Run package work from the repository root with pnpm; do not use npm or yarn and do not add a lockfile other than `pnpm-lock.yaml`. The npm invocation in the GitHub Action is an intentional, separate global-tool installation on an ephemeral runner; see [OpenWiki automation](operations/openwiki-automation.md).
- Use English UI prose, AUD currency, and `Australia/Brisbane` timezone. Contributor prose uses en-GB/Australian spelling.
- Do not commit secrets. `.gitignore` excludes `.env` and `.env.*` but keeps `.env.example` trackable; use an in-app `.env.example` with placeholders when an application is created.
- The working tree has untracked `.claude/`, `.codex/`, and `.cursor/` local hook configuration. If these are local state, add an ignore rule; if they are intended as portable tooling, deliberately version and document them. Current `.gitignore` ignores only the listed `.claude` local files.
- Keep demo credentials clearly marked and use no real client data in fixtures.
- Avoid adding later-stage features to the internal alpha; the exact product boundary is in [Cleaning CRM Product Model and Guardrails](product/domain-model.md).

The contributor contract also prescribes explicit Supabase grants for future tables and server-side/RPC enforcement for critical state changes. Those requirements have no source implementation yet and should be owned with future database migrations rather than root scripts.

## Narrow validation by change type

| Change | Narrowest current validation | What cannot yet be validated |
|---|---|---|
| Root workspace metadata | `pnpm install` under the required Node version | There are no workspace package scripts, type checks, linters, or tests. |
| Add an app/package manifest | `pnpm --filter <new-package-name> <its-script>` once defined | No conventional script names are established yet. |
| Add schema, RPCs, RLS, or generated types | The future database package’s focused migration/type/test command | There is no Supabase configuration, migration runner, or database test harness. |
| Change generated wiki automation | Inspect `.github/workflows/openwiki-update.yml`; use [OpenWiki automation](operations/openwiki-automation.md) | This repository contains no local workflow test suite. |

Do not claim broad `test`, `lint`, `typecheck`, build, database reset, or deployment commands until their package scripts/configurations are checked in. The repository has no test files; thus there are no representative assertions or failure cases to cite.

## Safe extension sequence

When implementing the first real component, establish its complete surface in the same change: package manifest and script contract, runtime entrypoint, typed public exports if shared, configuration with placeholder-only examples, focused tests, and root-compatible pnpm invocation. For database-backed product work, pair application code with the future `packages/db` schema/policy/RPC/type surface and the privacy/race invariants described in [the domain model](product/domain-model.md).
