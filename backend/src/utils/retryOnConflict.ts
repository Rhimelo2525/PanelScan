import { Prisma } from '@prisma/client';

/**
 * CockroachDB runs every transaction SERIALIZABLE and, when two of them touch
 * the same rows at once (a message being sent while the same chat is being
 * marked read), aborts one with a retryable error that Prisma reports as
 * P2034. The fix the database asks for is simply to run it again.
 */
const isRetryableConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

/** Runs `operation`, retrying it (with a short growing pause) when it lost a write conflict. Other errors pass straight through. */
export const retryOnConflict = async <T>(operation: () => Promise<T>, attempts = 4): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isRetryableConflict(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt + Math.floor(Math.random() * 25)));
    }
  }
};
