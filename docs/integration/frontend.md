# Frontend Integration

This guide explains how to consume the `nestjs-chat` backend from a React frontend. The React provider uses a **provider pattern** that abstracts the underlying chat transport, so you can swap providers without changing UI code.

::: warning The React client is not yet published on npm
`@chat-service/client` currently lives in the [nestjs-chat repo](https://github.com/innovartx/nestjs-chat/tree/main/packages/client) but hasn't been published to npm yet. Until it is, vendor the folder into your frontend project, or open an issue on GitHub if you'd like the package published sooner.

If you're writing your own frontend (not React, or just a minimal HTTP + Socket.IO wrapper), the REST + WebSocket shapes below are the contract — you don't need any npm package to talk to `nestjs-chat`.
:::

## Installation (vendored)

Copy [`packages/client/`](https://github.com/innovartx/nestjs-chat/tree/main/packages/client) into your frontend project, then install its peer deps:

```bash
pnpm add axios socket.io-client
```

The client package contains:
- `core/` — `IChatProvider` interface, types, and error definitions
- `providers/custom/` — `CustomChatProvider` implementation (HTTP + Socket.IO)

## Architecture

The chat frontend is built around a core `IChatProvider` interface. All UI components and hooks interact exclusively with this interface — they never call HTTP endpoints or Socket.IO directly.

```
React Components / Hooks
        │
        ▼
  IChatProvider (interface)
        │
        └── CustomChatProvider     (chat microservice)
```

### IChatProvider Interface

```typescript
export interface IChatProvider {
  initialize(appId: string, userId: string, accessToken?: string): Promise<void>
  connect(): Promise<User>
  disconnect(): Promise<void>
  isConnected(): boolean
  getCurrentUser(): User | null

  // Sub-services
  channels: IChannelService    // list, create, update, delete channels
  messages: IMessageService    // send, edit, delete, reactions, search
  users: IUserService          // profiles, block/unblock, search
  media: IMediaService         // file upload, thumbnails
}
```

Each sub-service (`IChannelService`, `IMessageService`, etc.) defines a contract for a specific domain. The provider implementation wires these to the actual backend.

---

## Setting Up the CustomChatProvider

The `CustomChatProvider` connects to your chat service backend via Axios (HTTP) and Socket.IO (real-time events).

### Environment Variable

Add the chat API URL to your environment:

```bash
# .env or .env.local
VITE_CHAT_API_URL=http://localhost:3001
```

::: warning
This is the **base URL** of the chat service, not the full path. The provider appends `/chat` automatically (matching the service's global prefix).
:::

### Provider Initialization

The `CustomChatProvider` creates an Axios instance and a Socket.IO connection during `initialize()`:

```typescript
import { CustomChatProvider } from '@chat-service/client/providers/custom/CustomChatProvider'

const provider = new CustomChatProvider()

// baseUrl = VITE_CHAT_API_URL, userId = current user ID, accessToken = JWT
await provider.initialize(
  import.meta.env.VITE_CHAT_API_URL,
  currentUser.id,
  accessToken,
)

// Now you can use the provider
const user = await provider.connect()
const channels = await provider.channels.getChannels({ limit: 20 })
```

Internally, `initialize()` does the following:
1. Creates an Axios instance with `baseURL` set to `{baseUrl}/chat` and the `Authorization` header
2. Creates a `CustomSocketManager` that connects to the Socket.IO server at `baseUrl` with the access token
3. Instantiates the sub-services (`CustomChannelService`, `CustomMessageService`, etc.) with the HTTP client and socket manager
4. Fetches the current user profile from the API

---

## Provider Factory

The `createChatProvider` factory function creates the correct provider based on a `ChatProviderType`:

```typescript
import { createChatProvider, ChatProviderType } from '@chat-service/client/providers/factory'

const provider = await createChatProvider({
  type: ChatProviderType.CUSTOM,
  appId: import.meta.env.VITE_CHAT_API_URL,  // base URL of the chat service
  userId: currentUser.id,
  accessToken: token,
})
```

No UI code changes are needed. All components and hooks continue to work through the `IChatProvider` abstraction.

---

## React Context Integration

The `GlobalChatProvider` component wraps your application and provides the chat provider to all child components via React Context.

```tsx
import { GlobalChatProvider } from '@chat-service/client/context/GlobalChatProvider'

function App() {
  const { user, accessToken, organizationId } = useAuth()

  return (
    <GlobalChatProvider
      appId={import.meta.env.VITE_CHAT_API_URL}
      userId={user?.id}
      accessToken={accessToken}
      organizationId={organizationId}
    >
      <RouterOutlet />
    </GlobalChatProvider>
  )
}
```

The `GlobalChatProvider`:
- Initializes the chat provider when credentials are available
- Loads the initial unread message count
- Subscribes to real-time events (new messages, unread count changes)
- Handles browser notifications and notification sounds
- Polls unread count as a fallback (every 30 seconds)
- Cleans up connections on unmount

::: tip
The `GlobalChatProvider` is non-blocking. If initialization fails or credentials are missing, the app renders normally without chat functionality. This ensures the chat module never blocks the rest of the application.
:::

### Consuming the Provider in Components

Use the `ChatContext` to access the provider in any component:

```tsx
import { useContext } from 'react'
import { ChatContext } from '@chat-service/client/context/ChatContext'

function ChannelList() {
  const { provider } = useContext(ChatContext)

  useEffect(() => {
    if (!provider) return

    const loadChannels = async () => {
      const result = await provider.channels.getChannels({ limit: 20 })
      setChannels(result.channels)
    }

    loadChannels()
  }, [provider])

  // ...
}
```

---

## Real-Time Events

The `CustomChatProvider` uses Socket.IO for real-time communication. Events are handled through callback subscriptions on the sub-services:

```typescript
// Subscribe to new messages
const unsubscribe = provider.messages.onMessageReceived((channel, message) => {
  console.log(`New message in ${channel.id}:`, message.text)
})

// Subscribe to unread count changes
const unsubscribe2 = provider.channels.onUnreadCountChanged((count) => {
  setBadgeCount(count)
})

// Clean up
unsubscribe()
unsubscribe2()
```

::: warning
Always store and call the unsubscribe functions on component unmount to prevent memory leaks.
:::

---

## Summary

| Concern | Solution |
|---------|----------|
| HTTP communication | Axios instance with `/chat` base path and Bearer token |
| Real-time events | Socket.IO via `CustomSocketManager` |
| Provider abstraction | `IChatProvider` interface with sub-services |
| Provider selection | `createChatProvider()` factory with `ChatProviderType` enum |
| React integration | `GlobalChatProvider` context component |
| Environment config | `VITE_CHAT_API_URL` pointing to your chat-enabled NestJS app |
| Source | [`packages/client/`](https://github.com/innovartx/nestjs-chat/tree/main/packages/client) in the `nestjs-chat` repo (not yet on npm — vendor the folder) |
