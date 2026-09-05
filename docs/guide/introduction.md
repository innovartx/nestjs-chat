---
title: Introduction
description: Overview of nestjs-chat — a real-time chat SDK for NestJS, shipped as an npm package.
---

# Introduction

## What is `nestjs-chat`?

[`nestjs-chat`](https://www.npmjs.com/package/nestjs-chat) is a **real-time chat SDK for NestJS**, distributed as a regular npm package. You install it into your existing NestJS backend, import `ChatModule.forRoot()`, provide a few host-side implementations (auth, user lookup, optionally storage), and get a full REST + WebSocket chat API — channels, messages, polls, scheduled messages, reactions, moderation, the lot.

There's no separate server to run and no hosted service. The SDK lives inside your NestJS process, alongside your own controllers.

::: tip Why self-host?
SaaS chat services charge per message or per MAU. With `nestjs-chat` you only pay for your PostgreSQL and Redis. No seat limits, no message caps, no vendor lock-in — it's MIT-licensed and runs wherever your NestJS app runs.
:::

## How it fits together

```
┌─────────────────────────────────────────────────────┐
│                  YOUR NestJS APP                    │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ AuthGuard   │  │ UserResolver │  │  Storage   │ │
│  │ (your impl) │  │ (your impl)  │  │ (your impl)│ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                 │        │
│  ┌──────▼────────────────▼─────────────────▼──────┐ │
│  │           ChatModule.forRoot({...})            │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Channels │ │ Messages │ │ Polls/Scheduled│ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Gateway  │ │  Users   │ │   Prisma/PG    │ │ │
│  │  │(Socket.IO│ │          │ │                │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## What you bring

Three required providers, two optional ones:

| Interface | Role | Required |
|-----------|------|:--------:|
| `IChatAuthGuard` | Validates the caller (JWT, session cookie, API key...) for HTTP + WebSocket. | Yes |
| `IChatUserExtractor` | Pulls `{ id, tenantId }` out of the request after the guard has run. | Yes |
| `IChatUserResolver` | Looks up user profiles by id (name, avatar, online status) in **your** user database. | Yes |
| `IChatStorageProvider` | Uploads message attachments to S3/GCS/local disk/etc. | No |
| `IChatEventHandler` | Observes chat events (e.g. to send push notifications or webhooks). | No |

Full shapes and examples: [Configuration](/guide/configuration).

## What the SDK brings

**Chat features**

- **Channels** — 1-on-1 direct messages with automatic deduplication per tenant, group channels with member cap, key/value metadata, custom types, freeze, hide, reset-history.
- **Messages** — text / image / video / audio / file, threading, forwarding, full-text search, edit + soft delete, mentions.
- **Real-time** — typing indicators, read receipts via `lastReadAt`, per-user unread counts, delivered receipts, presence (if your resolver implements `isOnline`).
- **Reactions** — emoji reactions per-user per-message, real-time add/remove.
- **Polls** — single or multi-vote, scheduled close, optional user-suggested options.
- **Scheduled messages** — delayed send backed by BullMQ; edit/cancel/send-now before the deadline.
- **Moderation** — channel freeze/unfreeze, per-user timed mute + ban, global user block, reporting.
- **Preferences** — per-channel push triggers and unread-count visibility.

**Infrastructure**

| Component | Version | Role |
|-----------|---------|------|
| NestJS | 10 | Host framework |
| Prisma | 7 | ORM — 13 models, bundled migrations applied via `chat-migrate` CLI |
| PostgreSQL | 15+ | Primary datastore for chat data |
| Socket.IO | 4 | Real-time gateway |
| Redis adapter | — | Multi-instance fan-out for Socket.IO |
| BullMQ | 5 | Delayed job queue for scheduled messages |
| Redis | 7+ | BullMQ backend + Socket.IO adapter |
| Winston | 3 | Structured logging (console + rotating file) |

## At a glance

| Metric | Value |
|--------|-------|
| REST endpoints | **63** |
| WebSocket events | **42** |
| Prisma models | **11** |
| Error codes | **30** |
| Internal modules | **6** (Channel, Message, Poll, User, Scheduled, Gateway) |
| License | MIT |

Next: [Getting Started](/guide/getting-started) to install and run.
