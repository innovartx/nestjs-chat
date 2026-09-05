---
title: Architecture
description: How nestjs-chat is structured internally — modules, providers, error handling, logging, and the chat database schema.
---

# Architecture

This page describes how `nestjs-chat` is structured **inside the package**. You don't need any of it to integrate the SDK — [Getting Started](/guide/getting-started) and [Configuration](/guide/configuration) are enough for that. Read on if you want to understand how requests flow through the SDK, debug an issue at the boundary between your host app and `ChatModule`, or contribute to the project.

If you want to hack on the SDK itself, also see [Contributing / Local Dev](/guide/contributing).

## SDK layout

Inside `packages/sdk/src/` (as published on npm, minus the build artifacts):

```
src/
├── chat.module.ts            # ChatModule.forRoot() / forRootAsync()
├── chat-module-options.ts    # ChatModuleOptions & ChatModuleProviders
├── index.ts                  # Barrel export (public API)
│
├── core/                     # SDK contract — what the host implements
│   ├── interfaces/           # IChatAuthGuard, IChatUserExtractor, IChatUserResolver,
│   │                         # IChatStorageProvider, IChatEventHandler
│   ├── tokens/               # Injection tokens (@Inject(CHAT_AUTH_GUARD), ...)
│   ├── types/                # Shared types (ChatUser, socket event names, ...)
│   └── constants/            # Defaults (limits, room prefixes, BullMQ queue name)
│
├── common/                   # Cross-module infrastructure
│   ├── prisma/               # PrismaService (bundled Prisma 7 + PostgreSQL adapter)
│   ├── guards/               # ChatAuthGuard — delegates to the host's IChatAuthGuard
│   ├── decorators/           # @CurrentChatUser() — reads the extractor output
│   ├── exceptions/           # ChatException, ChatErrorCode, handleServiceError
│   ├── filters/              # ChatExceptionFilter (Prisma + HTTP + unknown errors)
│   ├── interceptors/         # ChatResponseInterceptor (envelope format)
│   ├── logger/               # LoggerModule (Winston)
│   └── context/              # AsyncLocalStorage (per-request requestId)
│
└── modules/
    ├── channel/              # 36 endpoints, 17 WS events
    ├── message/              # 13 endpoints, 12 WS events
    ├── poll/                 # 3 endpoints
    ├── user/                 # 5 endpoints
    ├── scheduled/            # 5 endpoints + BullMQ processor
    └── gateway/              # Socket.IO gateway + ChatEventService
```

`prisma/schema.prisma` ships alongside (13 models, bundled migrations under `prisma/migrations/`).

`index.ts` is the only thing external code should import from — everything reachable from it is considered part of the public API. Anything under `common/` or deeper paths is internal and subject to change without notice.

## Modular architecture

Each feature is an **independent NestJS module** with its own controllers, services, and DTOs. Modules are registered in `ChatModule` and exported globally.

```
┌───────────────────────────────────────────────────────────────┐
│                       ChatModule (global)                     │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ChannelModule│  │MessageModule│  │ScheduledMessageModule│ │
│  │ 36 routes   │  │ 13 routes   │  │ 5 routes + BullMQ    │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ PollModule  │  │ChatUserMod. │  │ ChatGatewayModule    │ │
│  │ 3 routes    │  │ 5 routes    │  │ Socket.IO gateway    │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ PrismaModule (global) — PostgreSQL connection           │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## SDK/Plugin Pattern

The core design is the separation between the **contract** (`packages/sdk/src/core/interfaces/`) and the **implementation** (provided by the host application).

### Injection Tokens

`ChatModule` registers the host's providers via injection tokens:

| Token | Interface | Description |
|-------|-----------|-------------|
| `CHAT_AUTH_GUARD` | `IChatAuthGuard` | Validates authentication |
| `CHAT_USER_EXTRACTOR` | `IChatUserExtractor` | Extracts the user from the request |
| `CHAT_USER_RESOLVER` | `IChatUserResolver` | Resolves user profiles |
| `CHAT_STORAGE_PROVIDER` | `IChatStorageProvider` | File upload/deletion |
| `CHAT_EVENT_HANDLER` | `IChatEventHandler` | Hooks on chat events |
| `CHAT_MODULE_OPTIONS` | `ChatModuleOptions` | Configuration (DB, Redis, limits) |

### Authenticated Request Flow

```
HTTP Request
    │
    ▼
ChatAuthGuard (@UseGuards)
    │  delegates to CHAT_AUTH_GUARD (host impl)
    ▼
CHAT_USER_EXTRACTOR
    │  extracts ChatAuthUser { id, tenantId }
    ▼
@CurrentChatUser() decorator
    │  injects the user into the controller
    ▼
Controller → Service → Prisma
    │
    ▼
ChatResponseInterceptor
    │  formats { success, data, requestId, timestamp, path }
    ▼
JSON Response
```

### WebSocket Flow

```
Socket.IO Connection (/chat namespace)
    │
    ▼
handleConnection()
    │  CHAT_AUTH_GUARD.canActivate()
    │  CHAT_USER_EXTRACTOR.extractUser()
    ▼
Join room: tenant:{tenantId}
    │
    ▼
Client sends: chat:join:channel { channelId }
    │  verifies membership
    ▼
Join room: channel:{channelId}
    │
    ▼
Bidirectional events (typing, messages, reactions...)
```

## Error Handling

### ChatException

All business errors go through `ChatException`, which extends `HttpException` with a typed `ChatErrorCode`:

```typescript
throw ChatException.channelNotFound(channelId);
throw ChatException.userMuted();
throw ChatException.pinLimit(5);
throw ChatException.validation('Invalid email format', { field: 'email' });
```

### Error Codes

30 codes organized by domain:

| Category | Codes | HTTP Status |
|----------|-------|-------------|
| **Auth** | `CHAT_AUTH_FAILED`, `CHAT_AUTH_TOKEN_INVALID`, `CHAT_AUTH_FORBIDDEN` | 401, 403 |
| **Channel** | `CHAT_CHANNEL_NOT_FOUND`, `CHAT_CHANNEL_ALREADY_EXISTS`, `CHAT_CHANNEL_FROZEN`, `CHAT_CHANNEL_MEMBER_LIMIT`, `CHAT_CHANNEL_PIN_LIMIT` | 404, 409, 403, 413 |
| **Member** | `CHAT_NOT_CHANNEL_MEMBER`, `CHAT_NOT_CHANNEL_OPERATOR`, `CHAT_ALREADY_CHANNEL_MEMBER`, `CHAT_USER_MUTED`, `CHAT_USER_BANNED` | 403, 409 |
| **Message** | `CHAT_MESSAGE_NOT_FOUND`, `CHAT_MESSAGE_NOT_OWNER`, `CHAT_MESSAGE_TOO_LONG` | 404, 403, 400 |
| **Poll** | `CHAT_POLL_NOT_FOUND`, `CHAT_POLL_CLOSED`, `CHAT_POLL_OPTION_LIMIT`, `CHAT_POLL_ALREADY_VOTED` | 404, 410, 400, 409 |
| **Scheduled** | `CHAT_SCHEDULED_NOT_FOUND`, `CHAT_SCHEDULED_ALREADY_SENT`, `CHAT_SCHEDULED_INVALID_TIME` | 404, 410, 400 |
| **User** | `CHAT_USER_NOT_FOUND`, `CHAT_USER_ALREADY_BLOCKED` | 404, 409 |
| **Storage** | `CHAT_FILE_TOO_LARGE`, `CHAT_FILE_TYPE_NOT_ALLOWED`, `CHAT_UPLOAD_FAILED` | 400, 500 |
| **Generic** | `CHAT_VALIDATION_ERROR`, `CHAT_CONFLICT`, `CHAT_INTERNAL_ERROR`, `CHAT_RATE_LIMITED` | 400, 409, 500, 429 |

### ChatExceptionFilter

The global filter intercepts 3 types of errors and normalizes them:

1. **ChatException**: uses the code and status directly
2. **PrismaClientKnownRequestError**: maps Prisma codes (P2002 = conflict, P2025 = not found)
3. **Unknown errors**: returns `CHAT_INTERNAL_ERROR` (500)

Error response format:

```json
{
  "success": false,
  "error": {
    "code": "CHAT_CHANNEL_NOT_FOUND",
    "message": "Channel not found",
    "details": { "channelId": "abc-123" }
  },
  "requestId": "a1b2c3d4-e5f6-...",
  "statusCode": 404,
  "timestamp": "2026-04-03T10:30:00.000Z",
  "path": "/chat/channels/abc-123"
}
```

## Logging

### Winston with 3 Transports

| Transport | Destination | Level | Rotation |
|-----------|-------------|-------|----------|
| Console | stdout | `debug` (dev) / `info` (prod) | No |
| Error file | `logs/errors.log` | `error` | No |
| Combined file | `logs/combined.log` | `info`+ | No |

### RequestId per Request

Each HTTP request receives a unique `requestId` via `AsyncLocalStorage`. This requestId is:

- Automatically injected into all Winston logs
- Returned in every API response (`requestId` field)
- Propagated in errors for debugging

```
[2026-04-03T10:30:00.123Z] [INFO] [req:a1b2c3d4] ChannelService.createDirect — Creating DM between alice and bob
[2026-04-03T10:30:00.145Z] [INFO] [req:a1b2c3d4] ChannelService.createDirect — DM created: channel-xyz
```

## Database Design

### Two databases

`nestjs-chat` requires its own **dedicated PostgreSQL database** (or a separate `?schema=...` on the same cluster) for chat data. It owns this schema end-to-end — its bundled Prisma 7 generates a client against it, and the `chat-migrate` CLI applies migrations against it. Your own application's database stays untouched.

| Database | Tables | Configured via | Managed by |
|----------|--------|----------------|------------|
| Chat DB | 13 chat tables | `ChatModuleOptions.database.url` | `nestjs-chat` |
| Host DB | Whatever your app needs (users, org, billing, …) | Whatever you already use | Your host app |

The reason the schemas are separate: running two Prisma clients in the same process against the same schema leads to migration conflicts the moment either project evolves. Isolating the chat data also makes it trivially portable — you can point the SDK at a managed Postgres service while your app DB lives elsewhere.

### 11 Prisma Models

```
ChatChannel ──┬── ChatChannelMember (N:1)
              ├── ChatMessage (N:1) ── ChatReaction (N:1)
              ├── ChatPinnedMessage (N:1)
              └── ChatScheduledMessage (N:1)

ChatPoll ── ChatPollOption (N:1) ── ChatPollVote (N:1)

ChatUserBlock (standalone)
ChatReport (standalone)
```

### Multi-tenant Isolation

Each main entity carries a `tenantId` field:
- `ChatChannel.tenantId`
- `ChatChannelMember.tenantId`
- `ChatMessage.tenantId`
- `ChatScheduledMessage.tenantId`
- `ChatPoll.tenantId`
- `ChatUserBlock.tenantId`
- `ChatReport.tenantId`

::: warning No foreign key on tenantId
The `tenantId` is a free `String`, not a reference to a Tenant table. It is up to the host to map its tenant concept (organization, workspace, hotel...) to this field.
:::

### Read Receipts and Unread Count

The read receipts system uses a **per-member cursor** rather than a per-message marker:

- `ChatChannelMember.lastReadAt`: timestamp of the last read message
- `ChatChannelMember.lastReadMessageId`: ID of the last read message
- `ChatChannelMember.lastDeliveredAt`: timestamp of the last delivery

The **unread count** is calculated by counting channel messages with `createdAt > lastReadAt` (or since `historyResetAt` if the history has been reset).

::: tip Performance
This design is more performant than a per-message junction table. A single `UPDATE` on `ChatChannelMember` is enough to mark all messages as read, and the count is done via a simple `COUNT WHERE createdAt > cursor`.
:::

### Indexing

Indexes are optimized for the most frequent queries:

| Table | Index | Usage |
|-------|-------|-------|
| `ChatChannel` | `(tenantId, updatedAt DESC)` | Channel list by tenant |
| `ChatChannel` | `(tenantId, type)` | Filter by type |
| `ChatChannelMember` | `(userId, tenantId, leftAt)` | User's channels |
| `ChatChannelMember` | `(channelId, userId)` UNIQUE | Membership deduplication |
| `ChatMessage` | `(channelId, createdAt DESC)` | Paginated messages |
| `ChatMessage` | `(channelId, deletedAt, createdAt DESC)` | Non-deleted messages |
| `ChatMessage` | `(channelId, parentMessageId, createdAt DESC)` | Threads |
| `ChatScheduledMessage` | `(status, scheduledAt)` | BullMQ polling |
