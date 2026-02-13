import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';
import { SecurityAlertsService } from '../../security-alerts/security-alerts.service';

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
 * - Triggers security alert on rate limit breach
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

  /**
   * Override to trigger security alert when rate limit is exceeded.
   */
  protected throwThrottlingException(context: any): Promise<void> {
    try {
      const req = context.switchToHttp().getRequest<Request>();
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const user = (req as any).user;
      const clinicId = user?.clinicId;

      // Fire-and-forget: inject SecurityAlertsService from app context
      const alertsService = (context as any)
        .switchToHttp()
        .getRequest()
        ?.app?.get?.(SecurityAlertsService);

      if (alertsService) {
        alertsService.onRateLimitExceeded(ip, clinicId).catch(() => {});
      }
    } catch {
      // Don't let alert failure block the throttle response
    }

    throw new ThrottlerException();
  }
}
