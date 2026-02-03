import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Wrapper service for cache operations with pattern-based invalidation.
 *
 * Key naming convention: `entity:scope:id`
 * Examples:
 *   - `clinic:stats:clinic-uuid` (dashboard stats)
 *   - `clinic:profile:clinic-uuid` (clinic profile)
 *   - `notifications:count:user-uuid` (unread count)
 *   - `branding:slug:my-clinic` (public branding)
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Get a cached value, or execute the factory and cache the result.
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    try {
      const cached = await this.cache.get<T>(key);
      if (cached !== undefined && cached !== null) {
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Cache get error for key "${key}": ${error}`);
    }

    const value = await factory();

    try {
      await this.cache.set(key, value, ttlMs);
    } catch (error) {
      this.logger.warn(`Cache set error for key "${key}": ${error}`);
    }

    return value;
  }

  /**
   * Invalidate a specific cache key.
   */
  async invalidate(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete error for key "${key}": ${error}`);
    }
  }

  /**
   * Invalidate multiple cache keys.
   */
  async invalidateMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.invalidate(key)));
  }
}
