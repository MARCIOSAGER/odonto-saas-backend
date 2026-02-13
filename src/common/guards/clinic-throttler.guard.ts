import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Custom Throttler Guard for multi-tenant rate limiting.
 *
 * Limits requests by clinicId instead of IP, ensuring fair usage
 * across all tenants and preventing the "noisy neighbor" problem.
 *
 * Key features:
 * - Rate limits by clinicId (from JWT token)
 * - Falls back to IP for unauthenticated requests
 * - Redis-based for distributed systems
 */
@Injectable()
export class ClinicThrottlerGuard extends ThrottlerGuard {
  /**
   * Generate throttle key based on clinicId (multi-tenant isolation)
   */
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user;

    // For authenticated requests, use clinicId as the key
    if (user?.clinicId) {
      return `clinic:${user.clinicId}`;
    }

    // For unauthenticated requests, fall back to IP
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
