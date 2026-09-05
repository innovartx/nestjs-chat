# Backend Integration

This guide is the deep-dive reference for integrating [`nestjs-chat`](https://www.npmjs.com/package/nestjs-chat) into your NestJS backend. For a fast-path install walkthrough, see [Getting Started](/guide/getting-started).

## Overview

Install `nestjs-chat` from npm and import `ChatModule.forRoot()` into your NestJS application. You provide implementations of **3 required interfaces** and **2 optional ones** — the SDK handles everything else: database (Prisma + PostgreSQL), WebSocket gateway (Socket.IO), job queues (BullMQ + Redis), and all business logic (channels, messages, polls, scheduled messages).

```
Your NestJS App
├── ChatModule.forRoot({ ... })
│   ├── ChannelModule       (CRUD, membership, moderation)
│   ├── MessageModule       (send, edit, delete, reactions, search)
│   ├── PollModule          (create, vote, close)
│   ├── ChatUserModule      (profiles, block/unblock, online status)
│   ├── ScheduledMessageModule (deferred sending via BullMQ)
│   └── ChatGatewayModule   (Socket.IO real-time events)
└── Your providers (auth, user resolver, storage, events)
```

::: info Multi-tenant by design
Every operation is scoped by `tenantId`. The SDK never leaks data across tenants. Your `IChatUserExtractor` is responsible for providing the `tenantId` from the authenticated request.
:::

---

## Step 1: Install the SDK

```bash
pnpm add nestjs-chat
# or: npm install nestjs-chat
# or: yarn add nestjs-chat
```

Peer dependencies (install the ones you don't already have):

```bash
pnpm add @nestjs/common @nestjs/core class-transformer class-validator reflect-metadata rxjs
```

### Apply the chat database schema

The SDK requires a **dedicated PostgreSQL database** for chat data (13 tables, separate from your application database). It ships with a CLI tool to manage migrations:

```bash
# Apply migrations (production — safe, applies only pending migrations)
CHAT_DATABASE_URL="postgresql://user:pass@localhost:5432/chat_db" npx chat-migrate deploy

# Create + apply migrations (development)
CHAT_DATABASE_URL="postgresql://user:pass@localhost:5432/chat_db" npx chat-migrate dev

# Check migration status
CHAT_DATABASE_URL="postgresql://user:pass@localhost:5432/chat_db" npx chat-migrate status

# Open Prisma Studio (visual DB browser)
CHAT_DATABASE_URL="postgresql://user:pass@localhost:5432/chat_db" npx chat-migrate studio
```

::: tip Add to your scripts
```json
{
  "scripts": {
    "chat:migrate": "CHAT_DATABASE_URL=$CHAT_DATABASE_URL npx chat-migrate deploy",
    "chat:studio": "CHAT_DATABASE_URL=$CHAT_DATABASE_URL npx chat-migrate studio"
  }
}
```
:::

---

## Step 2: Implement the Required Interfaces

You must implement 3 interfaces. Each is injected via a Symbol token and used throughout the SDK internals.

### IChatAuthGuard

Validates incoming HTTP and WebSocket requests. Return `true` to allow access, `false` to reject.

**Interface definition:**

```typescript
// nestjs-chat — packages/sdk/src/core/interfaces/chat-auth.interface.ts

import { ExecutionContext } from '@nestjs/common';

export interface IChatAuthGuard {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}
```

**Example implementation:**

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { IChatAuthGuard } from 'nestjs-chat';

@Injectable()
export class MyAuthGuard implements IChatAuthGuard {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;
      return true;
    } catch {
      return false;
    }
  }
}
```

::: warning
The guard must attach the decoded user to `request.user` (or a similar property) so that the `IChatUserExtractor` can read it in the next step.
:::

Reference implementation in the repo: [`apps/example/src/providers/example-auth.guard.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-auth.guard.ts).

---

### IChatUserExtractor

Extracts the authenticated user identity from the request object. Called after the auth guard passes. Must return a `ChatAuthUser` or `null`.

**Interface definition:**

```typescript
// nestjs-chat — packages/sdk/src/core/interfaces/chat-auth.interface.ts

export interface ChatAuthUser {
  id: string;
  tenantId: string;
  email?: string;
  name?: string;
}

export interface IChatUserExtractor {
  extractUser(request: any): ChatAuthUser | null;
}
```

**Example implementation:**

```typescript
import { Injectable } from '@nestjs/common';
import { IChatUserExtractor, ChatAuthUser } from 'nestjs-chat';

@Injectable()
export class MyUserExtractor implements IChatUserExtractor {
  extractUser(request: any): ChatAuthUser | null {
    const user = request.user;
    if (!user) return null;

    return {
      id: user.id,
      tenantId: user.organizationId,
      email: user.email,
      name: user.name,
    };
  }
}
```

::: tip
The `tenantId` field is critical. It scopes all chat data (channels, messages, members) to a single tenant. Map it from whatever your JWT uses (e.g. `organizationId`, `companyId`, `workspaceId`). If your app is not multi-tenant, use a fixed value (e.g., `'default'`).
:::

Reference implementation in the repo: [`apps/example/src/providers/example-user-extractor.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-user-extractor.ts).

---

### IChatUserResolver

Resolves user IDs into display profiles. The SDK calls this to populate sender info on messages, member lists on channels, and search results.

**Interface definition:**

```typescript
// nestjs-chat — packages/sdk/src/core/interfaces/chat-user-resolver.interface.ts

import { ChatUser } from '../types/chat-user.types';

export interface IChatUserResolver {
  getUser(userId: string): Promise<ChatUser | null>;
  getUsers(userIds: string[]): Promise<ChatUser[]>;
  searchUsers(keyword: string, tenantId: string, limit?: number): Promise<ChatUser[]>;
  isOnline?(userId: string): Promise<boolean>;
}
```

Where `ChatUser` is:

```typescript
// nestjs-chat — packages/sdk/src/core/types/chat-user.types.ts

export interface ChatUser {
  id: string;
  nickname: string;
  profileUrl?: string;
  metadata?: Record<string, string>;
  isOnline?: boolean;
  lastSeenAt?: Date;
}
```

**Example implementation:**

```typescript
import { Injectable } from '@nestjs/common';
import { IChatUserResolver, ChatUser } from 'nestjs-chat';
import { UserService } from '../user/user.service';

@Injectable()
export class MyUserResolver implements IChatUserResolver {
  constructor(private readonly userService: UserService) {}

  async getUser(userId: string): Promise<ChatUser | null> {
    const user = await this.userService.findById(userId);
    if (!user) return null;
    return {
      id: user.id,
      nickname: user.displayName,
      profileUrl: user.avatarUrl,
      metadata: { role: user.role },
    };
  }

  async getUsers(userIds: string[]): Promise<ChatUser[]> {
    const users = await this.userService.findByIds(userIds);
    return users.map((u) => ({
      id: u.id,
      nickname: u.displayName,
      profileUrl: u.avatarUrl,
    }));
  }

  async searchUsers(
    keyword: string,
    tenantId: string,
    limit = 20,
  ): Promise<ChatUser[]> {
    const users = await this.userService.search(keyword, tenantId, limit);
    return users.map((u) => ({
      id: u.id,
      nickname: u.displayName,
      profileUrl: u.avatarUrl,
    }));
  }

  async isOnline(userId: string): Promise<boolean> {
    return this.userService.isOnline(userId);
  }
}
```

::: info
The `isOnline` method is optional (note the `?` in the interface). If not implemented, online status falls back to Socket.IO connection tracking.
:::

Reference implementation in the repo: [`apps/example/src/providers/example-user-resolver.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-user-resolver.ts).

---

## Step 3: (Optional) Implement Optional Interfaces

These interfaces are not required. If omitted, the corresponding features are either disabled or use built-in defaults.

### IChatStorageProvider

Handles file uploads for message attachments (images, videos, documents). If not provided, file message endpoints will return an error.

**Interface definition:**

```typescript
// nestjs-chat — packages/sdk/src/core/interfaces/chat-storage-provider.interface.ts

import { Readable } from 'stream';

export interface ChatUploadOptions {
  fileName: string;
  mimeType: string;
  folder?: string;
  tenantId: string;
}

export interface ChatUploadResult {
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  mimeType: string;
}

export interface IChatStorageProvider {
  upload(file: Buffer | Readable, options: ChatUploadOptions): Promise<ChatUploadResult>;
  delete(fileUrl: string): Promise<void>;
  getSignedUrl?(fileUrl: string, expiresIn?: number): Promise<string>;
}
```

**Example implementation (S3):**

```typescript
import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IChatStorageProvider, ChatUploadOptions, ChatUploadResult } from 'nestjs-chat';
import { Readable } from 'stream';

@Injectable()
export class S3StorageProvider implements IChatStorageProvider {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
    this.bucket = process.env.S3_BUCKET!;
  }

  async upload(file: Buffer | Readable, options: ChatUploadOptions): Promise<ChatUploadResult> {
    const key = `chat/${options.tenantId}/${options.folder || 'files'}/${Date.now()}-${options.fileName}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: options.mimeType,
    }));

    const fileUrl = `https://${this.bucket}.s3.amazonaws.com/${key}`;
    return {
      fileUrl,
      fileSize: Buffer.isBuffer(file) ? file.length : 0,
      mimeType: options.mimeType,
    };
  }

  async delete(fileUrl: string): Promise<void> {
    const key = new URL(fileUrl).pathname.slice(1);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(fileUrl: string, expiresIn = 3600): Promise<string> {
    const key = new URL(fileUrl).pathname.slice(1);
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
}
```

---

### IChatEventHandler

React to chat lifecycle events. Use this to trigger push notifications, update analytics, feed activity streams, etc. All methods are optional.

**Interface definition:**

```typescript
// nestjs-chat — packages/sdk/src/core/interfaces/chat-event-handler.interface.ts

export interface IChatEventHandler {
  onMessageSent?(channelId: string, message: Record<string, unknown>, tenantId: string): Promise<void>;
  onChannelCreated?(channel: Record<string, unknown>, tenantId: string): Promise<void>;
  onUserMentioned?(userId: string, channelId: string, messageId: string, tenantId: string): Promise<void>;
  onUnreadCountChanged?(userId: string, count: number, tenantId: string): Promise<void>;
}
```

**Example implementation:**

```typescript
import { Injectable } from '@nestjs/common';
import { IChatEventHandler } from 'nestjs-chat';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MyChatEventHandler implements IChatEventHandler {
  constructor(private readonly notificationService: NotificationService) {}

  async onMessageSent(channelId: string, message: Record<string, unknown>, tenantId: string) {
    await this.notificationService.notifyChannelMembers(channelId, {
      title: 'New message',
      body: String(message['text'] || 'New message received'),
      tenantId,
    });
  }

  async onUserMentioned(userId: string, channelId: string, messageId: string, tenantId: string) {
    await this.notificationService.notifyUser(userId, {
      title: 'You were mentioned',
      data: { channelId, messageId },
      tenantId,
    });
  }
}
```

---

## Step 4: Import ChatModule

### ChatModule.forRoot()

The synchronous configuration method. Use this when all config values are available at module registration time.

```typescript
import { Module } from '@nestjs/common';
import { ChatModule } from 'nestjs-chat';
import { MyAuthGuard } from './chat/my-auth.guard';
import { MyUserExtractor } from './chat/my-user-extractor';
import { MyUserResolver } from './chat/my-user-resolver';
import { S3StorageProvider } from './chat/s3-storage.provider';
import { MyChatEventHandler } from './chat/my-chat-event-handler';

@Module({
  imports: [
    ChatModule.forRoot({
      // Required: PostgreSQL connection string (dedicated DB for chat)
      database: {
        url: 'postgresql://user:pass@localhost:5432/chat_db?schema=public',
      },

      // Required: Redis connection for BullMQ job queues + Socket.IO adapter
      redis: {
        url: 'redis://localhost:6379',
      },

      // Optional: File upload constraints
      storage: {
        maxFileSize: 25 * 1024 * 1024,
        allowedMimeTypes: ['image/*', 'video/*', 'application/pdf'],
      },

      // Optional: Business limits
      limits: {
        maxChannelMembers: 100,
        maxPinnedMessages: 5,
        maxMessageLength: 5000,
        maxPollOptions: 10,
      },

      // Provider implementations
      providers: {
        authGuard: MyAuthGuard,
        userExtractor: MyUserExtractor,
        userResolver: MyUserResolver,
        storageProvider: S3StorageProvider,
        eventHandler: MyChatEventHandler,
      },
    }),
  ],
})
export class AppModule {}
```

::: warning
The `database.url` should point to a **dedicated PostgreSQL database** for chat data. Do not share it with your main application database to avoid schema conflicts with Prisma.
:::

---

### ChatModule.forRootAsync()

Use async configuration when you need to inject `ConfigService` or other providers to resolve configuration values at runtime.

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatModule } from 'nestjs-chat';
import { MyAuthGuard } from './chat/my-auth.guard';
import { MyUserExtractor } from './chat/my-user-extractor';
import { MyUserResolver } from './chat/my-user-resolver';
import { S3StorageProvider } from './chat/s3-storage.provider';
import { MyChatEventHandler } from './chat/my-chat-event-handler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        database: {
          url: config.getOrThrow<string>('CHAT_DATABASE_URL'),
        },
        redis: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
        limits: {
          maxChannelMembers: config.get<number>('CHAT_MAX_CHANNEL_MEMBERS', 100),
          maxMessageLength: config.get<number>('CHAT_MAX_MESSAGE_LENGTH', 5000),
        },
      }),
      providers: {
        authGuard: MyAuthGuard,
        userExtractor: MyUserExtractor,
        userResolver: MyUserResolver,
        storageProvider: S3StorageProvider,
        eventHandler: MyChatEventHandler,
      },
    }),
  ],
})
export class AppModule {}
```

::: tip
The `providers` object is passed at registration time (not inside `useFactory`) because provider classes are resolved by the NestJS DI container, not by the factory function. The factory only returns `ChatModuleOptions`.
:::

---

## Reference: example app in the repo

The [`apps/example/`](https://github.com/canisiusa/nestjs-chat/tree/main/apps/example) folder in the GitHub repo contains a complete, runnable integration that demonstrates every concept above. It has real JWT auth, a User table, seeded test users, and wires up all three required providers. Good file-by-file starting points:

| File | Description |
|------|-------------|
| [`src/app.module.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/app.module.ts) | Imports `ChatModule.forRootAsync()` with real providers |
| [`src/main.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/main.ts) | NestJS bootstrap with CORS + Swagger |
| [`src/auth.controller.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/auth.controller.ts) | `POST /auth/login` and `/auth/register` with JWT |
| [`src/providers/example-auth.guard.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-auth.guard.ts) | `IChatAuthGuard` implementation |
| [`src/providers/example-user-extractor.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-user-extractor.ts) | `IChatUserExtractor` implementation |
| [`src/providers/example-user-resolver.ts`](https://github.com/canisiusa/nestjs-chat/blob/main/apps/example/src/providers/example-user-resolver.ts) | `IChatUserResolver` implementation |

To run the example locally (clone the repo, not the npm package):

```bash
git clone https://github.com/canisiusa/nestjs-chat.git
cd nestjs-chat
pnpm install
cp apps/example/.env.example apps/example/.env
# Edit .env with your CHAT_DATABASE_URL, DATABASE_URL, REDIS_URL, JWT_SECRET

pnpm prisma:generate
pnpm prisma:push
cd apps/example && pnpm seed && cd ../..
pnpm dev

# Login: POST http://localhost:3001/chat/auth/login
# Body: { "email": "alice@example.com", "password": "password" }
```

See also [Contributing / Local Dev](/guide/contributing) for the full contributor workflow.
