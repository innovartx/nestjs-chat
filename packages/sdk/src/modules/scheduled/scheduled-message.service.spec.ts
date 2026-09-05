import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { ScheduledMessageService } from './scheduled-message.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { CHAT_QUEUE_TOKEN } from './scheduled-queue.provider';
import { ChatException } from '../../common/exceptions';
import { ChatErrorCode } from '../../common/exceptions/chat-error-codes';
import { createMockLogger, createMockPrisma, MockPrisma } from '../../common/testing/mocks';

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockMessageService() {
  return {
    sendTextMessage: vi.fn(),
  };
}

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('ScheduledMessageService', () => {
  let service: ScheduledMessageService;
  let prisma: MockPrisma;
  let queue: ReturnType<typeof createMockQueue>;
  let messageService: ReturnType<typeof createMockMessageService>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    queue = createMockQueue();
    messageService = createMockMessageService();
    logger = createMockLogger();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduledMessageService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessageService, useValue: messageService },
        { provide: CHAT_QUEUE_TOKEN, useValue: queue },
        { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(ScheduledMessageService);
  });

  describe('getScheduledMessages', () => {
    it('returns only PENDING messages for the channel/sender, ordered by scheduledAt', async () => {
      prisma.chatScheduledMessage.findMany.mockResolvedValue([{ id: 's1' }] as never);

      const result = await service.getScheduledMessages('c1', 'u1');

      expect(result).toEqual([{ id: 's1' }]);
      expect(prisma.chatScheduledMessage.findMany).toHaveBeenCalledWith({
        where: { channelId: 'c1', senderId: 'u1', status: 'PENDING' },
        orderBy: { scheduledAt: 'asc' },
      });
    });

    it('wraps Prisma errors into ChatException', async () => {
      prisma.chatScheduledMessage.findMany.mockRejectedValue(new Error('db'));
      await expect(service.getScheduledMessages('c1', 'u1')).rejects.toBeInstanceOf(ChatException);
    });
  });

  describe('createScheduledMessage', () => {
    it('rejects scheduledAt in the past', async () => {
      await expect(
        service.createScheduledMessage('c1', 'u1', 't1', {
          text: 'hi',
          scheduledAt: past(),
        }),
      ).rejects.toMatchObject({ code: ChatErrorCode.SCHEDULED_INVALID_TIME });
      expect(prisma.chatScheduledMessage.create).not.toHaveBeenCalled();
    });

    it('persists the row and enqueues a delayed BullMQ job', async () => {
      prisma.chatScheduledMessage.create.mockResolvedValue({ id: 'sm1' } as never);

      const dto = { text: 'hi', scheduledAt: future(), mentionedUserIds: ['u2'] };
      await service.createScheduledMessage('c1', 'u1', 't1', dto);

      expect(prisma.chatScheduledMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channelId: 'c1',
            senderId: 'u1',
            tenantId: 't1',
            text: 'hi',
            mentionedUserIds: ['u2'],
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'send-scheduled-message',
        { scheduledMessageId: 'sm1' },
        expect.objectContaining({
          jobId: 'scheduled-sm1',
          delay: expect.any(Number),
          attempts: 3,
        }),
      );
    });
  });

  describe('updateScheduledMessage', () => {
    const existingPending = {
      id: 'sm1',
      senderId: 'u1',
      status: 'PENDING',
      scheduledAt: new Date(Date.now() + 60000),
    };

    it('throws SCHEDULED_NOT_FOUND when missing', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue(null as never);
      await expect(
        service.updateScheduledMessage('c1', 'sm1', 'u1', { text: 'x' }),
      ).rejects.toMatchObject({ code: ChatErrorCode.SCHEDULED_NOT_FOUND });
    });

    it('throws MESSAGE_NOT_OWNER when senderId differs', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        ...existingPending,
        senderId: 'other',
      } as never);
      await expect(
        service.updateScheduledMessage('c1', 'sm1', 'u1', { text: 'x' }),
      ).rejects.toMatchObject({ code: ChatErrorCode.MESSAGE_NOT_OWNER });
    });

    it('throws SCHEDULED_ALREADY_SENT when status is not PENDING', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        ...existingPending,
        status: 'SENT',
      } as never);
      await expect(
        service.updateScheduledMessage('c1', 'sm1', 'u1', { text: 'x' }),
      ).rejects.toMatchObject({ code: ChatErrorCode.SCHEDULED_ALREADY_SENT });
    });

    it('rejects a new scheduledAt in the past', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue(existingPending as never);
      await expect(
        service.updateScheduledMessage('c1', 'sm1', 'u1', { scheduledAt: past() }),
      ).rejects.toMatchObject({ code: ChatErrorCode.SCHEDULED_INVALID_TIME });
    });

    it('removes the old job and re-adds one when updating scheduledAt', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue(existingPending as never);
      const newAt = future();
      prisma.chatScheduledMessage.update.mockResolvedValue({
        ...existingPending,
        scheduledAt: new Date(newAt),
      } as never);

      await service.updateScheduledMessage('c1', 'sm1', 'u1', { scheduledAt: newAt });

      expect(queue.remove).toHaveBeenCalledWith('scheduled-sm1');
      expect(queue.add).toHaveBeenCalledWith(
        'send-scheduled-message',
        { scheduledMessageId: 'sm1' },
        expect.objectContaining({ jobId: 'scheduled-sm1' }),
      );
    });
  });

  describe('cancelScheduledMessage', () => {
    it('marks the row as CANCELED and removes the queue job', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        senderId: 'u1',
        status: 'PENDING',
      } as never);
      prisma.chatScheduledMessage.update.mockResolvedValue({} as never);

      await service.cancelScheduledMessage('c1', 'sm1', 'u1');

      expect(prisma.chatScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sm1' },
        data: { status: 'CANCELED' },
      });
      expect(queue.remove).toHaveBeenCalledWith('scheduled-sm1');
    });

    it('refuses to cancel someone else’s scheduled message', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        senderId: 'other',
        status: 'PENDING',
      } as never);
      await expect(service.cancelScheduledMessage('c1', 'sm1', 'u1')).rejects.toMatchObject({
        code: ChatErrorCode.MESSAGE_NOT_OWNER,
      });
    });
  });

  describe('processScheduledMessage', () => {
    it('is a no-op when the row is not PENDING anymore', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        status: 'SENT',
      } as never);

      const result = await service.processScheduledMessage('sm1');

      expect(result).toBeUndefined();
      expect(messageService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('marks the row as FAILED when the channel is gone', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        status: 'PENDING',
        channelId: 'c1',
        senderId: 'u1',
        tenantId: 't1',
        text: 'hi',
        mentionedUserIds: [],
        metadata: null,
      } as never);
      prisma.chatChannel.findUnique.mockResolvedValue(null as never);
      prisma.chatScheduledMessage.update.mockResolvedValue({} as never);

      await service.processScheduledMessage('sm1');

      expect(prisma.chatScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sm1' },
        data: { status: 'FAILED', errorMessage: 'Channel deleted' },
      });
      expect(messageService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('skips sending when the sender is no longer a member', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        status: 'PENDING',
        channelId: 'c1',
        senderId: 'u1',
        tenantId: 't1',
        text: 'hi',
        mentionedUserIds: [],
        metadata: null,
      } as never);
      prisma.chatChannel.findUnique.mockResolvedValue({ id: 'c1' } as never);
      prisma.chatChannelMember.findUnique.mockResolvedValue({
        userId: 'u1',
        leftAt: new Date(),
        isBanned: false,
      } as never);
      prisma.chatScheduledMessage.update.mockResolvedValue({} as never);

      await service.processScheduledMessage('sm1');

      expect(messageService.sendTextMessage).not.toHaveBeenCalled();
      expect(prisma.chatScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sm1' },
        data: { status: 'FAILED', errorMessage: 'Sender no longer a channel member' },
      });
    });

    it('sends the message, marks SENT and stores the sent message id', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        status: 'PENDING',
        channelId: 'c1',
        senderId: 'u1',
        tenantId: 't1',
        text: 'hi',
        mentionedUserIds: [],
        metadata: null,
      } as never);
      prisma.chatChannel.findUnique.mockResolvedValue({ id: 'c1' } as never);
      prisma.chatChannelMember.findUnique.mockResolvedValue({
        userId: 'u1',
        leftAt: null,
        isBanned: false,
      } as never);
      messageService.sendTextMessage.mockResolvedValue({ id: 'msg_1' });
      prisma.chatScheduledMessage.update.mockResolvedValue({} as never);

      const result = await service.processScheduledMessage('sm1');

      expect(messageService.sendTextMessage).toHaveBeenCalledWith(
        'c1',
        'u1',
        't1',
        expect.objectContaining({ text: 'hi' }),
      );
      expect(prisma.chatScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sm1' },
        data: { status: 'SENT', sentMessageId: 'msg_1' },
      });
      expect(result).toEqual({ id: 'msg_1' });
    });

    it('marks FAILED and logs when message sending throws', async () => {
      prisma.chatScheduledMessage.findUnique.mockResolvedValue({
        id: 'sm1',
        status: 'PENDING',
        channelId: 'c1',
        senderId: 'u1',
        tenantId: 't1',
        text: 'hi',
        mentionedUserIds: [],
        metadata: null,
      } as never);
      prisma.chatChannel.findUnique.mockResolvedValue({ id: 'c1' } as never);
      prisma.chatChannelMember.findUnique.mockResolvedValue({
        userId: 'u1',
        leftAt: null,
        isBanned: false,
      } as never);
      messageService.sendTextMessage.mockRejectedValue(new Error('kaboom'));
      prisma.chatScheduledMessage.update.mockResolvedValue({} as never);

      await service.processScheduledMessage('sm1');

      expect(prisma.chatScheduledMessage.update).toHaveBeenLastCalledWith({
        where: { id: 'sm1' },
        data: { status: 'FAILED', errorMessage: 'kaboom' },
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
