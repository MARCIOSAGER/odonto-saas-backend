import * as winston from 'winston';
import { WinstonModuleOptions } from 'nest-winston';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Winston logger configuration.
 *
 * - Production: JSON format (for log aggregation — ELK, Datadog, CloudWatch)
 * - Development: colorized, human-readable output
 */
export const winstonConfig: WinstonModuleOptions = {
  level: isProduction ? 'info' : 'debug',
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          )
        : winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.colorize({ all: true }),
            winston.format.printf(({ timestamp, level, message, context, correlationId, ...meta }) => {
              const ctx = context ? `[${context}] ` : '';
              const cid = correlationId ? ` (${correlationId})` : '';
              const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level} ${ctx}${message}${cid}${extra}`;
            }),
          ),
    }),
  ],
};
