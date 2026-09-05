# Contributing to nestjs-chat

Thanks for your interest in contributing! This guide explains how to set up a local dev environment, make changes, and submit a pull request.

## Development setup

Prerequisites:

- Node.js 20 or 22
- pnpm 10
- Docker (for PostgreSQL + Redis) or a local install of both

```bash
git clone https://github.com/innovartx/nestjs-chat.git
cd nestjs-chat
pnpm install

# Start PostgreSQL + Redis (adjust to your setup)
# The example app reads CHAT_DATABASE_URL and REDIS_URL from apps/example/.env
cp apps/example/.env.example apps/example/.env

pnpm prisma:generate
pnpm prisma:push

# Seed 5 test users and start the example app
cd apps/example && pnpm seed && cd ../..
pnpm dev
```

## Project layout

- `packages/sdk/` — the published `nestjs-chat` package
- `apps/example/` — reference integration, **not** published
- `docs/` — VitePress documentation, deployed to GitHub Pages on push to `main`

## Making a change

1. Create a branch off `main` following the naming convention (see below): `git checkout -b feat/my-change`
2. Make your change — keep PRs focused and small when possible.
3. Add or update tests under `packages/sdk/src/**/*.spec.ts`.
4. Update docs in `docs/` if the change affects public APIs.
5. Run the local checks:

   ```bash
   pnpm --filter nestjs-chat lint
   pnpm --filter nestjs-chat typecheck
   pnpm --filter nestjs-chat test
   pnpm --filter nestjs-chat build
   ```

6. Open a pull request. CI must pass before merge.

## Branch names

Branches must follow `<type>/<slug>` where `<type>` is one of the Conventional Commit types (see below) and `<slug>` is lowercase letters, digits, dots, hyphens, underscores, or slashes.

Valid:

- `feat/add-reactions`
- `fix/exception-filter`
- `chore/bump-0.1.1`
- `docs/update-backend-guide`

Invalid: `my-branch`, `Feature/Add-Reactions`, `fixstuff`.

Dependabot branches are auto-exempt.

## Pull request titles and descriptions

**Titles** must follow [Conventional Commits](https://www.conventionalcommits.org/). Valid types: `feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`, `perf`, `style`, `build`, `revert`. Scope is optional. The subject must start with a lowercase letter and must not end with a period.

Valid:

- `feat(channel): add pin limit enforcement`
- `fix(auth): reject tokens with missing tenantId`
- `docs(readme): document forRootAsync options`
- `chore(deps): bump @nestjs/core to 10.4.16`

**Descriptions** must include these H2 sections (see `.github/pull_request_template.md` — opening a PR pre-fills it):

- `## Summary` — what + why
- `## Testing` — how you verified the change
- `## Breaking changes` — migration path, or `None`

The `PR lint` CI check enforces all three rules (title, branch, description) and blocks merging if any fails.

## Commit messages

Same Conventional Commit types as PR titles. Individual commits inside a branch don't need to be squeaky-clean — we squash-merge, so only the PR title lands on `main`.

## Tests

- **Unit tests** live next to the code: `foo.ts` → `foo.spec.ts`.
- **Integration tests** that need a real Postgres/Redis should end in `.int.spec.ts` — the CI workflow runs them with service containers.
- Coverage is reported but not gated; try to keep new code covered.

## Documentation

Docs live in `docs/` and use VitePress. Preview locally:

```bash
pnpm docs:dev
# → http://localhost:5173
```

## Reporting security issues

Please **do not** open a public issue. See [SECURITY.md](./SECURITY.md).

## Code of conduct

By participating, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).
