# nestjs-chat

[![npm version](https://img.shields.io/npm/v/nestjs-chat.svg)](https://www.npmjs.com/package/nestjs-chat)
[![CI](https://github.com/innovartx/nestjs-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/innovartx/nestjs-chat/actions/workflows/ci.yml)
[![CodeQL](https://github.com/innovartx/nestjs-chat/actions/workflows/codeql.yml/badge.svg)](https://github.com/innovartx/nestjs-chat/actions/workflows/codeql.yml)
[![Docs](https://img.shields.io/badge/docs-online-brightgreen.svg)](https://innovartx.github.io/nestjs-chat/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Real-time chat SDK for NestJS — Prisma 7 + PostgreSQL + Socket.IO + BullMQ.

Designed as a **NestJS SDK/Plugin**: install `nestjs-chat`, import `ChatModule.forRoot()` into any backend project, and inject your own auth, users, and storage.

## Quick Start

```bash
pnpm install

# Set up the example app environment
cp apps/example/.env.example apps/example/.env
# Edit apps/example/.env with your CHAT_DATABASE_URL, DATABASE_URL, and REDIS_URL

# Generate Prisma clients (SDK chat DB + example user DB)
pnpm prisma:generate

# Apply database schemas
pnpm prisma:push

# Seed the example app with 5 test users
cd apps/example && pnpm seed && cd ../..

# Start the example app (wraps the SDK)
pnpm dev
# Chat service running on http://localhost:3001/chat
# Swagger API docs on http://localhost:3001/docs/api
```

### Test Authentication

The example app includes a real JWT auth flow:

```bash
# Login with a seeded user
curl -X POST http://localhost:3001/chat/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "password123"}'
# Returns: { "access_token": "eyJhbG..." }

# Use the token for chat API calls
curl http://localhost:3001/chat/channels/my \
  -H "Authorization: Bearer <TOKEN>"
```

## Monorepo Structure

```
chat-service/
├── packages/
│   ├── sdk/                    # nestjs-chat — ChatModule.forRoot()
│   │   ├── src/
│   │   │   ├── chat.module.ts  # Main module (library, no app.module/main.ts)
│   │   │   ├── index.ts        # Barrel export
│   │   │   ├── core/           # Interfaces, tokens, types, constants
│   │   │   ├── common/         # Prisma, guards, exceptions, logger, filters
│   │   │   └── modules/        # channel, message, poll, user, scheduled, gateway
│   │   ├── prisma/             # Chat schema (11 models)
│   │   └── package.json
│   └── client/                 # @chat-service/client — Frontend provider
│       ├── core/               # Interfaces + types + errors
│       ├── providers/custom/   # CustomChatProvider + services + mappers
│       └── package.json
├── apps/
│   └── example/                # Example app wrapping the SDK
│       ├── src/
│       │   ├── app.module.ts   # Imports ChatModule.forRoot() with real providers
│       │   ├── main.ts         # Bootstrap with Swagger
│       │   ├── auth.controller # Login/Register with JWT
│       │   ├── prisma.service  # User table (example's own DB)
│       │   ├── seed.ts         # 5 test users
│       │   └── providers/      # ExampleAuthGuard, ExampleUserExtractor, ExampleUserResolver
│       ├── prisma/             # User schema (example's own)
│       └── .env
├── docs/                       # VitePress documentation
├── pnpm-workspace.yaml         # pnpm workspaces
└── package.json                # Root scripts
```

## Documentation

| Resource | URL |
|----------|-----|
| **Swagger UI** | [http://localhost:3001/docs/api](http://localhost:3001/docs/api) |
| **VitePress Docs** | [http://localhost:5173](http://localhost:5173) (after `pnpm docs:dev`) |

Full documentation is available via VitePress:

```bash
pnpm docs:dev
# Docs available at http://localhost:5173
```

Contents:

- **[Guide](/docs/guide/)** — Introduction, Getting Started, Architecture, Configuration
- **[Backend Integration](/docs/integration/backend.md)** — How to install the SDK and integrate it into your NestJS app
- **[Frontend Integration](/docs/integration/frontend.md)** — React provider to connect your UI to the chat service
- **[API Reference](/docs/api/)** — 63 REST endpoints, 33 WebSocket events, error codes, DB schema

## Overview

| Metric | Value |
|--------|-------|
| REST Endpoints | 63 |
| WebSocket Events | 33 |
| Prisma Models | 11 |
| Error Codes | 30 |
| Tech | NestJS 12, Prisma 7, PostgreSQL, Socket.IO, BullMQ, Redis, Winston |

## Scripts

```bash
# Root commands (run from monorepo root)
pnpm dev              # Start the example app (dev with watch)
pnpm start:dev        # Alias for pnpm dev
pnpm build            # Build all packages
pnpm prisma:generate  # Generate Prisma clients (SDK + example)
pnpm prisma:push      # Apply database schemas (SDK + example)
pnpm docs:dev         # VitePress documentation

# Example app commands
cd apps/example
pnpm seed             # Seed 5 test users
pnpm prisma:studio    # Visual DB interface (example user DB)

# SDK commands
cd packages/sdk
pnpm prisma:studio    # Visual DB interface (chat DB)
```

## License

MIT
