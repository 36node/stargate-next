import IORedis, { type Redis } from "ioredis";

let clientSingleton: Redis | undefined;

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const REDIS_CONNECT_TIMEOUT_MS = 3000;
export const REDIS_COMMAND_TIMEOUT_MS = 2000;
export const REDIS_HEALTH_TIMEOUT_MS = 1500;

export type RedisHealthCheck =
  | { ok: true; latencyMs: number }
  | { error: string; latencyMs: number; ok: false };

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Shared ioredis client configured through `REDIS_URL`.
 */
export function getRedisClient(): Redis {
  if (!clientSingleton || clientSingleton.status === "end") {
    clientSingleton = new IORedis(redisUrl, {
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      keepAlive: 30_000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    });

    // ioredis emits connection errors asynchronously; without a listener they
    // can become noisy unhandled errors instead of actionable diagnostics.
    clientSingleton.on("error", (error) => {
      console.error("[redis] client error", error);
    });
  }
  return clientSingleton;
}

export async function withRedisTimeout<T>(
  promise: Promise<T>,
  timeoutMs = REDIS_COMMAND_TIMEOUT_MS,
  label = "redis"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function checkRedisHealth(): Promise<RedisHealthCheck> {
  const startedAt = Date.now();

  try {
    await withRedisTimeout(
      getRedisClient().ping(),
      REDIS_HEALTH_TIMEOUT_MS,
      "redis health check"
    );
    return { latencyMs: Date.now() - startedAt, ok: true };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      latencyMs: Date.now() - startedAt,
      ok: false,
    };
  }
}
