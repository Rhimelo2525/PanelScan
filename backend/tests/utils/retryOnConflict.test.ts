import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { retryOnConflict } from '../../src/utils/retryOnConflict';

const conflict = () => new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', { code: 'P2034', clientVersion: 'test' });

describe('retryOnConflict', () => {
  it('runs the operation again after a write conflict and returns its result', async () => {
    const operation = vi.fn().mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockResolvedValue('done');

    await expect(retryOnConflict(operation)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt with the conflict error', async () => {
    const operation = vi.fn().mockRejectedValue(conflict());

    await expect(retryOnConflict(operation, 3)).rejects.toMatchObject({ code: 'P2034' });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('never retries any other error', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('validation failed'));

    await expect(retryOnConflict(operation)).rejects.toThrow('validation failed');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
