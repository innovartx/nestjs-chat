---
title: Contributing / Local Dev
description: How to clone the nestjs-chat repo, run the example app locally, and submit a pull request.
---

# Contributing / Local Dev

This page is for people who want to **hack on the SDK itself** — fix a bug, add a feature, improve the docs. If you just want to integrate `nestjs-chat` into your NestJS app, you're on the wrong page; [Getting Started](/guide/getting-started) is the one you want.

The authoritative source for contribution rules is [`CONTRIBUTING.md`](https://github.com/innovartx/nestjs-chat/blob/main/CONTRIBUTING.md) in the repo. This page mirrors it and adds a bit of narrative about the layout.

## Repo layout

```
nestjs-chat/
├── packages/
│   ├── sdk/           # The published `nestjs-chat` package
│   │   ├── src/       # SDK source — see Architecture for the breakdown
│   │   ├── prisma/    # Chat schema + bundled migrations
│   │   ├── test/e2e/  # 199-assertion end-to-end suite (4 scripts)
│   │   └── package.json
│   └── client/        # @chat-service/client — React provider (not yet on npm)
├── apps/
│   └── example/       # Reference NestJS integration, used as the E2E target
├── docs/              # VitePress docs (deploys to GitHub Pages on push to main)
└── .github/workflows/ # CI (lint, typecheck, tests, E2E, CodeQL, release, pr-lint)
```

## Prerequisites

| Tool | Minimum version |
|------|------------------|
| Node.js | 20 or 22 (we test both in CI) |
| pnpm | 10 |
| PostgreSQL | 15+ |
| Redis | 7+ |

## Bootstrap

```bash
git clone https://github.com/innovartx/nestjs-chat.git
cd nestjs-chat
pnpm install

cp apps/example/.env.example apps/example/.env
# Fill in CHAT_DATABASE_URL, DATABASE_URL, REDIS_URL, JWT_SECRET
```

The example app uses **two databases** — one for the chat SDK (`CHAT_DATABASE_URL`), one for its own `User` table (`DATABASE_URL`). Both can be the same Postgres cluster, just different `?schema=` values or different database names.

Apply both schemas and seed five test users:

```bash
pnpm prisma:generate   # generate Prisma clients for both SDK and example
pnpm prisma:push       # apply the schemas
cd apps/example && pnpm seed && cd ../..
```

Seeded users:

| Email | Password |
|-------|----------|
| `alice@example.com` | `password` |
| `bob@example.com` | `password` |
| `charlie@example.com` | `password` |
| `diana@example.com` | `password` |
| `eve@example.com` | `password` (tenant `org-2` — the others are `org-1`) |

## Running the example

```bash
pnpm dev
```

The example NestJS app boots on `http://localhost:3001/chat` with:

- REST API under `/chat/*`
- Socket.IO gateway on the `/chat` namespace
- Swagger UI at `/docs/api`
- Watch mode enabled (nest-cli)

Smoke-test auth:

```bash
curl -X POST http://localhost:3001/chat/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "password"}'
# → { "access_token": "eyJhbGciOi..." }
```

## Making a change

1. Branch off `main` using `<type>/<slug>` — types are the standard Conventional Commits list (`feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`, `perf`, `style`, `build`, `revert`). Example: `feat/add-reactions`, `fix/exception-filter`, `docs/clarify-tenant-id`. The `PR lint` CI job enforces this on every PR.
2. Make the change — keep PRs focused. Squash-merge is the default, so individual commits inside the branch don't need to be pristine, but PR titles must follow Conventional Commits.
3. Add or update tests. Unit tests live next to the code (`foo.ts` → `foo.spec.ts`); end-to-end tests live under [`packages/sdk/test/e2e/`](https://github.com/innovartx/nestjs-chat/tree/main/packages/sdk/test/e2e).
4. If you change public API, update [Configuration](/guide/configuration), [Backend Integration](/integration/backend), or [Getting Started](/guide/getting-started) as appropriate.
5. Run the local checks before opening the PR:

   ```bash
   pnpm --filter nestjs-chat lint
   pnpm --filter nestjs-chat typecheck
   pnpm --filter nestjs-chat test
   pnpm --filter nestjs-chat build
   ```

6. Open a pull request. The description must contain these H2 sections (the PR template pre-fills them):
   - `## Summary` — what + why
   - `## Testing` — how you verified it
   - `## Breaking changes` — migration path, or `None`

   CI will block the merge if the title, branch name, or description don't match these rules.

## Running the E2E suite locally

With the example app running on `:3001` and the databases seeded:

```bash
pnpm --filter nestjs-chat test:e2e
```

This runs four scripts sequentially (199 assertions total). The `run-hardening` script includes a 65-second sleep to test ban/mute auto-expiry — if you're iterating on something else, run just the relevant suite:

```bash
pnpm --filter nestjs-chat test:e2e:golden       # 73 assertions, every REST route
pnpm --filter nestjs-chat test:e2e:extended     # 82 assertions, all Socket.IO events + authz
pnpm --filter nestjs-chat test:e2e:hardening    # 34 assertions, security + edge cases
pnpm --filter nestjs-chat test:e2e:concurrency  # 10 assertions, races + transactions
```

The same suite runs in CI on every PR against a disposable Postgres + Redis + example-app setup — see [`.github/workflows/ci.yml`](https://github.com/innovartx/nestjs-chat/blob/main/.github/workflows/ci.yml).

## Release flow

Releases are driven by git tags. To cut `vX.Y.Z`:

1. Bump `packages/sdk/package.json` to `X.Y.Z` (PR).
2. After merge, tag the new `main` commit: `git tag -a vX.Y.Z -m "..."; git push --tags`.
3. The `release` workflow runs lint + typecheck + test + build, then `npm publish --provenance --access public`, then opens a GitHub release with auto-generated notes.

The npm token is stored as the `NPM_TOKEN` repo secret (granular, Bypass 2FA enabled — required because CI can't respond to a TOTP prompt).

## Reporting security issues

**Do not open a public issue.** See [SECURITY.md](https://github.com/innovartx/nestjs-chat/blob/main/SECURITY.md) for the private disclosure channel.
