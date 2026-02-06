import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * Service for managing custom Prometheus metrics.
 * Provides methods to track HTTP requests, cache performance, and business metrics.
 */
@Injectable()
export class MetricsService {
  // HTTP Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;

  // Cache Metrics
  public readonly cacheHitsTotal: Counter<string>;
  public readonly cacheMissesTotal: Counter<string>;

  // Database Metrics
  public readonly dbQueriesTotal: Counter<string>;
  public readonly slowQueriesTotal: Counter<string>;

  // WebSocket Metrics
  public readonly wsConnectionsActive: Gauge<string>;

  // Rate Limiting Metrics
  public readonly rateLimitHitsTotal: Counter<string>;
  public readonly rateLimitBlockedTotal: Counter<string>;

  constructor() {
    // HTTP request counter
    this.httpRequestsTotal = new Counter({
      name: 'odonto_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [register],
    });

    // HTTP request duration histogram (for P95, P99)
    this.httpRequestDuration = new Histogram({
      name: 'odonto_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 3, 5, 10],
      registers: [register],
    });

    // Cache hit counter
    this.cacheHitsTotal = new Counter({
      name: 'odonto_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_key'],
      registers: [register],
    });

    // Cache miss counter
    this.cacheMissesTotal = new Counter({
      name: 'odonto_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_key'],
      registers: [register],
    });

    // Database queries counter
    this.dbQueriesTotal = new Counter({
      name: 'odonto_db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation'],
      registers: [register],
    });

    // Slow queries counter
    this.slowQueriesTotal = new Counter({
      name: 'odonto_slow_queries_total',
      help: 'Total number of slow database queries (>1s)',
      labelNames: ['threshold'],
      registers: [register],
    });

    // Active WebSocket connections gauge
    this.wsConnectionsActive = new Gauge({
      name: 'odonto_ws_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [register],
    });

    // Rate limit hits counter
    this.rateLimitHitsTotal = new Counter({
      name: 'odonto_rate_limit_hits_total',
      help: 'Total number of rate limit hits',
      labelNames: ['clinic_id', 'plan'],
      registers: [register],
    });

    // Rate limit blocked requests counter
    this.rateLimitBlockedTotal = new Counter({
      name: 'odonto_rate_limit_blocked_total',
      help: 'Total number of blocked requests due to rate limiting',
      labelNames: ['clinic_id', 'plan'],
      registers: [register],
    });
  }

  /**
   * Track HTTP request metrics
   */
  trackHttpRequest(method: string, path: string, statusCode: number, durationMs: number) {
    const normalizedPath = this.normalizePath(path);
    this.httpRequestsTotal.labels(method, normalizedPath, statusCode.toString()).inc();
    this.httpRequestDuration
      .labels(method, normalizedPath, statusCode.toString())
      .observe(durationMs / 1000);
  }

  /**
   * Track cache hit
   */
  trackCacheHit(cacheKey: string) {
    this.cacheHitsTotal.labels(cacheKey).inc();
  }

  /**
   * Track cache miss
   */
  trackCacheMiss(cacheKey: string) {
    this.cacheMissesTotal.labels(cacheKey).inc();
  }

  /**
   * Track database query
   */
  trackDbQuery(operation: string) {
    this.dbQueriesTotal.labels(operation).inc();
  }

  /**
   * Track slow query
   */
  trackSlowQuery(threshold: string) {
    this.slowQueriesTotal.labels(threshold).inc();
  }

  /**
   * Increment active WebSocket connections
   */
  incrementWsConnections() {
    this.wsConnectionsActive.inc();
  }

  /**
   * Decrement active WebSocket connections
   */
  decrementWsConnections() {
    this.wsConnectionsActive.dec();
  }

  /**
   * Track rate limit hit
   */
  trackRateLimitHit(clinicId: string, plan: string) {
    this.rateLimitHitsTotal.labels(clinicId, plan).inc();
  }

  /**
   * Track rate limit block
   */
  trackRateLimitBlocked(clinicId: string, plan: string) {
    this.rateLimitBlockedTotal.labels(clinicId, plan).inc();
  }

  /**
   * Normalize API paths to avoid high cardinality
   * Example: /api/v1/patients/123 -> /api/v1/patients/:id
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/api\/v1\/[a-z-]+\/[0-9a-f-]{36}/g, '/api/v1/:resource/:id') // UUIDs
      .replace(/\/api\/v1\/[a-z-]+\/\d+/g, '/api/v1/:resource/:id') // Numeric IDs
      .replace(/\?.*$/, ''); // Remove query params
  }
}
