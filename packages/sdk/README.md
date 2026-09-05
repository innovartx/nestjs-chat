# nestjs-chat

[![npm version](https://img.shields.io/npm/v/nestjs-chat.svg)](https://www.npmjs.com/package/nestjs-chat)
[![CI](https://github.com/canisiusa/nestjs-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/canisiusa/nestjs-chat/actions/workflows/ci.yml)
[![CodeQL](https://github.com/canisiusa/nestjs-chat/actions/workflows/codeql.yml/badge.svg)](https://github.com/canisiusa/nestjs-chat/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-online-brightgreen.svg)](https://canisiusa.github.io/nestjs-chat/)

Production-ready real-time chat SDK for NestJS — drop-in `ChatModule.forRoot()` with Prisma, PostgreSQL, Socket.IO, BullMQ, and Redis.

You bring your **auth**, **users**, and (optional) **storage**. The SDK brings everything else: channels, messages, polls, scheduled messages, reactions, typing indicators, presence, moderation, and a multi-tenant data model.

## Install

```bash
pnpm add nestjs-chat
# peer deps
pnpm add @nestjs/common @nestjs/core class-transformer class-validator reflect-metadata rxjs
```

Run migrations (PostgreSQL):

```bash
npx chat-migrate
```

## Quick start

```ts
import { ChatModule } from 'nestjs-chat';
import { MyAuthGuard, MyUserExtractor, MyUserResolver } from './chat-providers';

@Module({
  imports: [
    ChatModule.forRoot({
      database: { url: process.env.CHAT_DATABASE_URL! },
      redis: { url: process.env.REDIS_URL! },
      logging: { level: 'info' },
      providers: {
        authGuard: MyAuthGuard,
        userExtractor: MyUserExtractor,
        userResolver: MyUserResolver,
      },
    }),
  ],
})
export class AppModule {}
```

The async form (`ChatModule.forRootAsync`) is also available for config injection.

## What you provide

| Interface | Purpose | Required |
| --- | --- | --- |
| `IChatAuthGuard` | Validate the caller (JWT, session, API key...) | Yes |
| `IChatUserExtractor` | Extract `{ id, tenantId, ... }` from the request | Yes |
| `IChatUserResolver` | Look up / search users by id in your own DB | Yes |
| `IChatStorageProvider` | Upload attachments (S3, GCS, local...) | Optional |
| `IChatEventHandler` | Observe chat events for your own side-effects | Optional |

All interfaces are exported from the package root.

## What you get

- **63 REST endpoints** — channels, messages, polls, reactions, scheduled messages, moderation
- **42 WebSocket events** — real-time messages, typing, presence, read receipts
- **Multi-tenant isolation** — every query scoped by `tenantId`
- **BullMQ queues** — scheduled messages, fan-out, moderation jobs
- **Prisma 7 schema** — 13 models, migrations bundled

## Requirements

- Node 18+
- NestJS 10
- PostgreSQL 14+
- Redis 6+

## License

MIT
