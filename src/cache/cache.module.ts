import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { RedisCacheService } from './cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST');

        // If Redis is configured, use it; otherwise fall back to in-memory
        if (redisHost) {
          const store = await redisStore({
            host: redisHost,
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD') || undefined,
            ttl: 60 * 1000, // default 60s in ms
          });

          return { store };
        }

        // In-memory fallback (development without Redis)
        return {
          ttl: 60 * 1000,
          max: 500,
        };
      },
    }),
  ],
  providers: [RedisCacheService],
  exports: [NestCacheModule, RedisCacheService],
})
export class RedisCacheModule {}
