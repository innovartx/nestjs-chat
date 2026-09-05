---
layout: home
hero:
  name: nestjs-chat
  text: Real-time chat SDK for NestJS
  tagline: Install `nestjs-chat`, import `ChatModule.forRoot()`, and add chat to any NestJS backend in minutes.
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/getting-started
    - theme: alt
      text: Backend Integration
      link: /integration/backend
    - theme: alt
      text: npm
      link: https://www.npmjs.com/package/nestjs-chat
features:
  - title: Drop-in NestJS module
    details: Install nestjs-chat from npm, import ChatModule.forRoot() into your existing NestJS project. You bring auth, users, and storage — the SDK brings everything else.
  - title: 63 REST endpoints
    details: Channels, messages, polls, scheduled messages, moderation, reactions. Swagger-documented. Works alongside your own controllers.
  - title: 42 WebSocket events
    details: Real-time via Socket.IO — typing, read receipts, reactions, presence, member events. Redis adapter for horizontal scaling.
  - title: Multi-tenant by design
    details: Every query scoped by tenantId. Your IChatUserExtractor decides how tenants map to your app (org, workspace, project — whatever).
  - title: Production-grade data layer
    details: Prisma 7 + PostgreSQL for persistence, BullMQ + Redis for scheduled messages, Winston for structured logs. 13 models, bundled migrations.
  - title: Self-hosted, no SaaS fees
    details: You only pay for your PostgreSQL and Redis. No per-seat or per-message pricing. MIT licensed.
---
