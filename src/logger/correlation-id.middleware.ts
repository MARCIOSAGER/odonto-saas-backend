import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Adds a unique correlation ID to every request.
 * - Uses X-Correlation-Id header if provided (by upstream proxy/gateway)
 * - Otherwise generates a short random ID
 * - Attaches to request for use in logging
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || crypto.randomBytes(8).toString('hex');

    (req as any).correlationId = correlationId;
    next();
  }
}
