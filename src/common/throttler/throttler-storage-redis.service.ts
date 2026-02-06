import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Redis-based storage for throttler.
 * Enables distributed rate limiting across multiple instances.
 */
@Injectable()
export class ThrottlerStorageRedisService extends ThrottlerStorageService implements OnModuleDestroy {
  private redis: Redis | null = null;
  private readonly fallback = new Map<string, number[]>();

  constructor() {
    super();
    // Initialize Redis if available
    if (process.env.REDIS_HOST) {
      try {
        this.redis = new Redis({
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          retryStrategy: () => null, // Graceful degradation
          lazyConnect: true,
        });

        this.redis.connect().catch(() => {
          console.warn('Throttler: Redis unavailable, using in-memory fallback');
          this.redis = null;
        });
      } catch {
        this.redis = null;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    // Redis implementation
    if (this.redis) {
      try {
        const redisKey = `throttler:${key}`;
        const multi = this.redis.multi();
        multi.incr(redisKey);
        multi.pttl(redisKey);
        multi.pexpire(redisKey, ttl);

        const results = await multi.exec();
        if (results && results.length >= 2) {
          const totalHits = (results[0] as [null, number])[1];
          const timeToExpire = (results[1] as [null, number])[1];

          return {
            totalHits,
            timeToExpire: timeToExpire > 0 ? timeToExpire : ttl,
          };
        }
      } catch {
        // Fall through to in-memory on error
      }
    }

    // In-memory fallback
    const now = Date.now();
    const record = this.fallback.get(key) || [];
    const filtered = record.filter((timestamp) => timestamp + ttl > now);

    filtered.push(now);
    this.fallback.set(key, filtered);

    // Cleanup old entries
    if (Math.random() < 0.01) {
      for (const [k, timestamps] of this.fallback.entries()) {
        const cleaned = timestamps.filter((ts) => ts + ttl > now);
        if (cleaned.length === 0) {
          this.fallback.delete(k);
        } else {
          this.fallback.set(k, cleaned);
        }
      }
    }

    return {
      totalHits: filtered.length,
      timeToExpire: ttl,
    };
  }
}
