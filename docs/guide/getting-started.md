---
title: Getting Started
description: Install nestjs-chat from npm and run your first chat-enabled NestJS app.
---

# Getting Started

This guide takes you from zero to a running NestJS app with chat features in about 15 minutes, using the [`nestjs-chat`](https://www.npmjs.com/package/nestjs-chat) package.

If you want to **hack on the SDK itself**, see [Contributing / Local Dev](/guide/contributing) instead.

## Prerequisites

| Tool | Minimum version | Check |
|------|-----------------|-------|
| Node.js | 20 | `node -v` |
| PostgreSQL | 15 | `psql --version` |
| Redis | 7 | `redis-cli --version` |
| A NestJS 10 project | — | `npx @nestjs/cli --version` |

::: tip Spin up Postgres + Redis with Docker
If you don't have them installed locally:

```bash
docker run -d --name chat-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=chat \
  postgres:15

docker run -d --name chat-redis -p 6379:6379 redis:7-alpine
```

:::

## 1. Install the package

In your existing NestJS app:

```bash
pnpm add nestjs-chat
# or: npm install nestjs-chat
# or: yarn add nestjs-chat
```

Peer dependencies (probably already in your project — skip whatever you already have):

```bash
pnpm add @nestjs/common @nestjs/core class-transformer class-validator reflect-metadata rxjs
```

## 2. Apply the database schema

The SDK ships with a bundled Prisma 7 and a `chat-migrate` CLI that applies the 13 chat tables to your database **without touching your host app's Prisma version**.

Point it at a dedicated PostgreSQL database:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat" npx chat-migrate
```

::: warning Use a dedicated database for chat data
The SDK manages its own schema and migrations. Pointing it at your application's main database will cause Prisma migration conflicts. The chat DB can be a second schema in the same Postgres cluster — just a different `?schema=` value — or a wholly separate database.
:::

## 3. Implement the three required providers

The SDK hands authentication, user resolution, and tenant isolation back to your app via three interfaces. A minimal example with JWT-based auth:

::: code-group

```ts [chat-providers/auth.guard.ts]
import { Injectable, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IChatAuthGuard } from 'nestjs-chat';

@Injectable()
export class ChatAuthGuard implements IChatAuthGuard {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return false;
    try {
      request.jwtPayload = this.jwt.verify(auth.slice(7));
      return true;
    } catch {
      return false;
    }
  }
}
```

```ts [chat-providers/user-extractor.ts]
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IChatUserExtractor, ChatAuthUser } from 'nestjs-chat';

@Injectable()
export class ChatUserExtractor implements IChatUserExtractor {
  constructor(private readonly jwt: JwtService) {}

  extractUser(request: any): ChatAuthUser | null {
    // HTTP: the guard already verified the token
    const payload = request.jwtPayload ?? this.verifySocket(request);
    if (!payload) return null;
    return {
      id: payload.sub,
      tenantId: payload.organizationId ?? 'default',
      email: payload.email,
      name: payload.name,
    };
  }

  private verifySocket(request: any) {
    const auth = request.headers?.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    try {
      return this.jwt.verify(auth.slice(7));
    } catch {
      return null;
    }
  }
}
```

```ts [chat-providers/user-resolver.ts]
import { Injectable } from '@nestjs/common';
import { IChatUserResolver, ChatUser } from 'nestjs-chat';
import { PrismaService } from '../prisma.service'; // your own Prisma

@Injectable()
export class ChatUserResolver implements IChatUserResolver {
  constructor(private readonly prisma: PrismaService) {}

  async getUser(userId: string): Promise<ChatUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? this.map(user) : null;
  }

  async getUsers(userIds: string[]): Promise<ChatUser[]> {
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    return users.map(this.map);
  }

  async searchUsers(keyword: string, tenantId: string, limit = 20): Promise<ChatUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: tenantId,
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
    return users.map(this.map);
  }

  private map = (user: { id: string; name: string; avatar?: string | null }): ChatUser => ({
    id: user.id,
    nickname: user.name,
    profileUrl: user.avatar ?? undefined,
  });
}
```

:::

## 4. Wire `ChatModule` into your `AppModule`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from 'nestjs-chat';
import { ChatAuthGuard } from './chat-providers/auth.guard';
import { ChatUserExtractor } from './chat-providers/user-extractor';
import { ChatUserResolver } from './chat-providers/user-resolver';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),

    ChatModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        database: { url: config.get('CHAT_DATABASE_URL')! },
        redis: { url: config.get('REDIS_URL')! },
        logging: { level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug' },
      }),
      providers: {
        authGuard: ChatAuthGuard,
        userExtractor: ChatUserExtractor,
        userResolver: ChatUserResolver,
      },
    }),
  ],
})
export class AppModule {}
```

Set the env vars in your `.env`:

```ini
CHAT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="change-me"
```

## 5. Start your app

```bash
pnpm start:dev
```

Your existing NestJS server now exposes every chat route and WebSocket event under the namespace your app already uses. By default you'll get:

- **63 REST routes** mounted on `/channels`, `/channels/:id/messages`, `/users`, etc. — the full set is documented in [API Reference / REST Endpoints](/api/rest-endpoints).
- **42 WebSocket events** on the Socket.IO gateway — see [API Reference / WebSocket Events](/api/websocket-events).

::: info Controller prefix
The SDK's controllers are mounted at the root — so `POST /channels/direct`, `GET /channels/my`, etc. If you want them under a prefix like `/chat/...`, use NestJS's own [`app.setGlobalPrefix('chat')`](https://docs.nestjs.com/faq/global-prefix) in `main.ts`.
:::

## 6. Smoke-test it

Create a user in your own DB, issue a JWT, then:

```bash
# List your channels (empty at first)
curl http://localhost:3000/channels/my \
  -H "Authorization: Bearer <TOKEN>"

# Create a direct channel with user "bob-id"
curl -X POST http://localhost:3000/channels/direct \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "bob-id"}'
```

Swagger is auto-registered by the SDK controllers — if your app calls `SwaggerModule.setup(...)`, every chat route will be documented alongside your own.

## Next steps

- [Configuration](/guide/configuration) — all the knobs on `ChatModuleOptions` (limits, storage, logging) and the optional `storageProvider` / `eventHandler` providers.
- [Backend Integration](/integration/backend) — deeper dive into each interface, error handling, and production recommendations.
- [Adapter example](/integration/adapter-example) — a single-file copy-pasteable version of the 3 required providers plus the optional ones.
- [API Reference](/api/rest-endpoints) — every REST route and WebSocket event with payload shapes.
