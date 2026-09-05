import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { ChatUserService } from './chat-user.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CHAT_USER_RESOLVER } from '../../core/tokens/injection-tokens';
import { ChatException } from '../../common/exceptions';
import { ChatErrorCode } from '../../common/exceptions/chat-error-codes';
import {
  createMockLogger,
  createMockPrisma,
  createMockUserResolver,
  MockPrisma,
} from '../../common/testing/mocks';

describe('ChatUserService', () => {
  let service: ChatUserService;
  let prisma: MockPrisma;
  let userResolver: ReturnType<typeof createMockUserResolver>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    userResolver = createMockUserResolver();
    logger = createMockLogger();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatUserService,
        { provide: PrismaService, useValue: prisma },
        { provide: CHAT_USER_RESOLVER, useValue: userResolver },
        { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(ChatUserService);
  });

  describe('getUser', () => {
    it('returns the user with online status when available', async () => {
      userResolver.getUser.mockResolvedValue({ id: 'u1', nickname: 'Alice' });
      (userResolver.isOnline as Mock).mockResolvedValue(true);

      const result = await service.getUser('u1', 't1');

      expect(result).toEqual({ id: 'u1', nickname: 'Alice', isOnline: true });
      expect(userResolver.getUser).toHaveBeenCalledWith('u1', 't1');
      expect(userResolver.isOnline).toHaveBeenCalledWith('u1');
    });

    it('omits isOnline when the resolver does not implement it', async () => {
      userResolver.getUser.mockResolvedValue({ id: 'u1', nickname: 'Alice' });
      delete (userResolver as Partial<typeof userResolver>).isOnline;

      const result = await service.getUser('u1');

      expect(result).toEqual({ id: 'u1', nickname: 'Alice', isOnline: undefined });
    });

    it('throws USER_NOT_FOUND when the resolver returns null', async () => {
      userResolver.getUser.mockResolvedValue(null);

      await expect(service.getUser('ghost')).rejects.toMatchObject({
        code: ChatErrorCode.USER_NOT_FOUND,
      });
    });

    it('wraps unexpected resolver errors as INTERNAL_ERROR', async () => {
      userResolver.getUser.mockRejectedValue(new Error('db down'));

      await expect(service.getUser('u1')).rejects.toBeInstanceOf(ChatException);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('delegates to the user resolver', async () => {
      const users = [{ id: 'u1' }, { id: 'u2' }];
      userResolver.searchUsers.mockResolvedValue(users as never);

      const result = await service.searchUsers('ali', 't1', 10);

      expect(result).toBe(users);
      expect(userResolver.searchUsers).toHaveBeenCalledWith('ali', 't1', 10);
    });

    it('wraps resolver errors', async () => {
      userResolver.searchUsers.mockRejectedValue(new Error('boom'));
      await expect(service.searchUsers('x', 't1')).rejects.toBeInstanceOf(ChatException);
    });
  });

  describe('blockUser', () => {
    it('upserts the block row with tenantId', async () => {
      prisma.chatUserBlock.upsert.mockResolvedValue({} as never);

      await service.blockUser('u1', 't1', { userId: 'u2' });

      expect(prisma.chatUserBlock.upsert).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: 'u1', blockedId: 'u2' } },
        create: { tenantId: 't1', blockerId: 'u1', blockedId: 'u2' },
        update: {},
      });
      expect(logger.info).toHaveBeenCalledWith(
        'User blocked',
        expect.objectContaining({ blockerId: 'u1', blockedId: 'u2', tenantId: 't1' }),
      );
    });

    it('propagates as ChatException when Prisma throws', async () => {
      prisma.chatUserBlock.upsert.mockRejectedValue(new Error('fk'));
      await expect(service.blockUser('u1', 't1', { userId: 'u2' })).rejects.toBeInstanceOf(
        ChatException,
      );
    });
  });

  describe('unblockUser', () => {
    it('deletes the block row', async () => {
      prisma.chatUserBlock.deleteMany.mockResolvedValue({ count: 1 } as never);

      await service.unblockUser('u1', { userId: 'u2' });

      expect(prisma.chatUserBlock.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: 'u1', blockedId: 'u2' },
      });
      expect(logger.info).toHaveBeenCalledWith('User unblocked', expect.any(Object));
    });
  });

  describe('getBlockedUsers', () => {
    it('returns an empty array when the user has blocked nobody', async () => {
      prisma.chatUserBlock.findMany.mockResolvedValue([] as never);

      const result = await service.getBlockedUsers('u1', 't1');

      expect(result).toEqual([]);
      expect(userResolver.getUsers).not.toHaveBeenCalled();
    });

    it('resolves blocked user profiles through the user resolver', async () => {
      prisma.chatUserBlock.findMany.mockResolvedValue([
        { blockedId: 'u2' },
        { blockedId: 'u3' },
      ] as never);
      const users = [{ id: 'u2' }, { id: 'u3' }];
      userResolver.getUsers.mockResolvedValue(users as never);

      const result = await service.getBlockedUsers('u1', 't1');

      expect(prisma.chatUserBlock.findMany).toHaveBeenCalledWith({
        where: { blockerId: 'u1', tenantId: 't1' },
        select: { blockedId: true },
      });
      expect(userResolver.getUsers).toHaveBeenCalledWith(['u2', 'u3']);
      expect(result).toBe(users);
    });
  });

  describe('isUserBlocked', () => {
    it('returns true when a block row exists', async () => {
      prisma.chatUserBlock.findUnique.mockResolvedValue({ id: 'b1' } as never);
      await expect(service.isUserBlocked('u1', 'u2')).resolves.toBe(true);
    });

    it('returns false when no block row exists', async () => {
      prisma.chatUserBlock.findUnique.mockResolvedValue(null as never);
      await expect(service.isUserBlocked('u1', 'u2')).resolves.toBe(false);
    });

    it('uses the compound unique key', async () => {
      prisma.chatUserBlock.findUnique.mockResolvedValue(null as never);
      await service.isUserBlocked('u1', 'u2');
      expect(prisma.chatUserBlock.findUnique).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: 'u1', blockedId: 'u2' } },
      });
    });

    it('wraps Prisma errors into ChatException', async () => {
      prisma.chatUserBlock.findUnique.mockRejectedValue(new Error('oops'));
      await expect(service.isUserBlocked('u1', 'u2')).rejects.toBeInstanceOf(ChatException);
    });
  });
});
