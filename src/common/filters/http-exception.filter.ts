import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string | string[]) || exception.message;
        error = responseObj.error as string;
      }
    } else if (exception instanceof Error) {
      // Log full error internally
      if (process.env.NODE_ENV !== 'production') {
        this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
        // In development, show detailed error for debugging
        message = exception.message;
      } else {
        // In production, hide internal error details from response
        this.logger.error(`Unhandled error: ${exception.message}`);
        message = 'Internal server error';
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
    };

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`);
      Sentry.captureException(exception, {
        tags: { url: request.url, method: request.method },
      });
    } else {
      this.logger.warn(`${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`);
    }

    response.status(status).json(errorResponse);
  }
}
