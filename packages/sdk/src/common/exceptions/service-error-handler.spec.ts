import { vi } from 'vitest';
import { handleServiceError } from './service-error-handler';
import { ChatException } from './chat.exception';
import { ChatErrorCode } from './chat-error-codes';

const silentLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleServiceError', () => {
  it('returns the original ChatException unchanged', () => {
    const original = ChatException.notChannelMember();
    const result = handleServiceError(original, silentLogger, 'Ctx.method');
    expect(result).toBe(original);
    expect(silentLogger.error).not.toHaveBeenCalled();
  });

  it('maps Prisma P2002 (unique constraint) to a CONFLICT exception', () => {
    const prismaErr = Object.assign(new Error('Unique constraint'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email', 'tenantId'] },
    });
    const result = handleServiceError(prismaErr, silentLogger, 'UserService.create');
    expect(result).toBeInstanceOf(ChatException);
    expect(result.code).toBe(ChatErrorCode.CONFLICT);
    expect(result.message).toContain('email, tenantId');
    expect(silentLogger.error).toHaveBeenCalled();
  });

  it('maps Prisma P2025 (not found) to CHANNEL_NOT_FOUND', () => {
    const prismaErr = Object.assign(new Error('Record not found'), {
      code: 'P2025',
    });
    const result = handleServiceError(prismaErr, silentLogger, 'ChannelService.get');
    expect(result.code).toBe(ChatErrorCode.CHANNEL_NOT_FOUND);
  });

  it('maps Prisma P2003 (FK violation) to VALIDATION_ERROR', () => {
    const prismaErr = Object.assign(new Error('FK'), {
      code: 'P2003',
      meta: { field_name: 'channelId' },
    });
    const result = handleServiceError(prismaErr, silentLogger, 'Svc.m');
    expect(result.code).toBe(ChatErrorCode.VALIDATION_ERROR);
    expect(result.details).toEqual({ field: 'channelId' });
  });

  it('maps unknown Prisma codes to INTERNAL_ERROR', () => {
    const prismaErr = Object.assign(new Error('boom'), { code: 'P9999' });
    const result = handleServiceError(prismaErr, silentLogger, 'Svc.m');
    expect(result.code).toBe(ChatErrorCode.INTERNAL_ERROR);
  });

  it('treats PrismaClientValidationError as VALIDATION_ERROR', () => {
    const err = new Error('bad shape');
    err.name = 'PrismaClientValidationError';
    const result = handleServiceError(err, silentLogger, 'Svc.m');
    expect(result.code).toBe(ChatErrorCode.VALIDATION_ERROR);
  });

  it('treats PrismaClientInitializationError as INTERNAL_ERROR with a user-friendly message', () => {
    const err = new Error('cannot connect');
    err.name = 'PrismaClientInitializationError';
    const result = handleServiceError(err, silentLogger, 'Svc.m');
    expect(result.code).toBe(ChatErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('Service temporarily unavailable');
  });

  it('wraps unknown errors using the method name from the context string', () => {
    const result = handleServiceError(
      new Error('oops'),
      silentLogger,
      'ChannelService.createChannel',
    );
    expect(result.code).toBe(ChatErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('Failed to createChannel');
  });

  it('wraps non-Error throws (e.g. thrown strings) safely', () => {
    const result = handleServiceError('bare string', silentLogger, 'Svc.m');
    expect(result).toBeInstanceOf(ChatException);
    expect(result.code).toBe(ChatErrorCode.INTERNAL_ERROR);
  });
});
