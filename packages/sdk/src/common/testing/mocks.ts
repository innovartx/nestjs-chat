import { vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';
/* istanbul ignore file */
/// <reference types="jest" />
import type { Logger } from 'winston';
import type { IChatUserResolver } from '../../core/interfaces/chat-user-resolver.interface';
import type { IChatEventHandler } from '../../core/interfaces/chat-event-handler.interface';
import type { IChatStorageProvider } from '../../core/interfaces/chat-storage-provider.interface';

type ModelMock = {
  findUnique: Mock;
  findFirst: Mock;
  findMany: Mock;
  create: Mock;
  createMany: Mock;
  update: Mock;
  updateMany: Mock;
  upsert: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  aggregate: Mock;
  groupBy: Mock;
};

const CHAT_MODELS = [
  'chatChannel',
  'chatChannelMember',
  'chatMessage',
  'chatReaction',
  'chatPinnedMessage',
  'chatScheduledMessage',
  'chatPoll',
  'chatPollOption',
  'chatPollVote',
  'chatCall',
  'chatCallParticipant',
  'chatUserBlock',
  'chatReport',
] as const;

type ChatModelName = (typeof CHAT_MODELS)[number];

export type MockPrisma = Record<ChatModelName, ModelMock> & {
  $transaction: Mock;
  $connect: Mock;
  $disconnect: Mock;
};

function modelMock(): ModelMock {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockPrisma(): MockPrisma {
  const base = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn((arg) => (typeof arg === 'function' ? arg(base) : Promise.all(arg))),
  } as unknown as MockPrisma;

  for (const name of CHAT_MODELS) {
    (base as Record<string, unknown>)[name] = modelMock();
  }

  return base;
}

export function createMockLogger(): Mocked<Logger> {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    log: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Mocked<Logger>;
}

export function createMockUserResolver(): Mocked<IChatUserResolver> {
  return {
    getUser: vi.fn(),
    getUsers: vi.fn(),
    searchUsers: vi.fn(),
    isOnline: vi.fn(),
  } as unknown as Mocked<IChatUserResolver>;
}

export function createMockEventHandler(): Mocked<IChatEventHandler> {
  return {
    onMessageSent: vi.fn(),
    onChannelCreated: vi.fn(),
    onUserMentioned: vi.fn(),
    onUnreadCountChanged: vi.fn(),
  } as unknown as Mocked<IChatEventHandler>;
}

export function createMockStorageProvider(): Mocked<IChatStorageProvider> {
  return {
    upload: vi.fn(),
    delete: vi.fn(),
    getSignedUrl: vi.fn(),
  } as unknown as Mocked<IChatStorageProvider>;
}

export function createMockEmitter() {
  return {
    emitToChannel: vi.fn(),
    emitToUser: vi.fn(),
    emitToTenant: vi.fn(),
    broadcast: vi.fn(),
    notifyMessageSent: vi.fn(),
    notifyChannelCreated: vi.fn(),
    notifyMentioned: vi.fn(),
    notifyUnreadCount: vi.fn(),
  };
}
