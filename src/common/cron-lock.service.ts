import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CronLockService implements OnModuleInit {
  private readonly logger = new Logger(CronLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "_CronLock" (
          name VARCHAR(100) PRIMARY KEY,
          locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
          locked_until TIMESTAMP NOT NULL,
          instance_id VARCHAR(100) NOT NULL
        )
      `;
    } catch (error) {
      this.logger.warn(`Could not create _CronLock table: ${error}`);
    }
  }

  /**
   * Try to acquire a named lock. Returns true if acquired.
   * Lock auto-expires after ttlMinutes (stale locks are reclaimed).
   */
  async tryAcquire(name: string, ttlMinutes = 10): Promise<boolean> {
    const now = new Date();
    const until = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const instanceId = String(process.pid);

    try {
      const result = await this.prisma.$executeRaw`
        INSERT INTO "_CronLock" (name, locked_at, locked_until, instance_id)
        VALUES (${name}, ${now}, ${until}, ${instanceId})
        ON CONFLICT (name) DO UPDATE
        SET locked_at = ${now}, locked_until = ${until}, instance_id = ${instanceId}
        WHERE "_CronLock".locked_until < ${now}
      `;
      return result > 0;
    } catch (error) {
      this.logger.warn(`Lock acquire failed for "${name}": ${error}`);
      return false;
    }
  }

  /**
   * Release a named lock.
   */
  async release(name: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "_CronLock" WHERE name = ${name}
      `;
    } catch (error) {
      this.logger.warn(`Lock release failed for "${name}": ${error}`);
    }
  }
}
