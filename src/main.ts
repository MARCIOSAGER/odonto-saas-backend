import './common/sentry/instrument';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { winstonConfig } from './logger/winston.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
    rawBody: true, // Preserve raw body for Stripe webhook signature verification
  });
  const configService = app.get(ConfigService);
  const bootstrapLogger = new Logger('Bootstrap');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // ── Critical env var validation ──────────────────────────────────────
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret || jwtSecret.length < 32) {
    bootstrapLogger.error('FATAL: JWT_SECRET must be set and at least 32 characters. Aborting.');
    process.exit(1);
  }

  if (isProduction) {
    const encryptionKey = configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length !== 64) {
      bootstrapLogger.error(
        'FATAL: ENCRYPTION_KEY must be set (64 hex chars) in production. ' +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
      process.exit(1);
    }
  }

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Necessário: frontend e backend em domínios diferentes, /uploads precisa ser acessível cross-origin
      frameguard: { action: 'deny' }, // Previne clickjacking
      hsts: { maxAge: 31536000, includeSubDomains: true }, // Force HTTPS por 1 ano
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  // CORS — origins configurable via env (comma-separated), with safe defaults
  const corsOriginsEnv = configService.get<string>('CORS_ORIGINS');
  const corsOrigins = corsOriginsEnv
    ? corsOriginsEnv.split(',').map((o) => o.trim())
    : ['https://odonto.marciosager.com', 'http://localhost:3000', 'http://localhost:3001'];

  app.enableCors({
    origin: (origin, callback) => {
      // Requests without Origin (server-to-server webhooks, mobile apps, curl).
      // Security for these relies on JWT auth / webhook token verification, not CORS.
      if (!origin) {
        return callback(null, true);
      }

      if (corsOrigins.includes(origin)) {
        return callback(null, origin);
      }

      bootstrapLogger.warn(`CORS blocked request from origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Static files (uploads) - served AFTER CORS and Helmet so headers are applied
  // SECURITY NOTE: /uploads/* is served without authentication.
  // Uploaded files (logos, favicons, patient photos) are accessible to anyone with the URL.
  // File names are UUIDs, making enumeration impractical.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    index: false,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());

  // Swagger documentation — disabled in production to avoid exposing API schema
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OdontoSaaS API')
      .setDescription('API para sistema SaaS de clínicas odontológicas multi-tenant')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Autenticação e autorização')
      .addTag('clinics', 'Gerenciamento de clínicas')
      .addTag('patients', 'Gerenciamento de pacientes')
      .addTag('appointments', 'Gerenciamento de agendamentos')
      .addTag('dentists', 'Gerenciamento de dentistas')
      .addTag('services', 'Gerenciamento de serviços')
      .addTag('webhooks', 'Webhooks para integrações')
      .addTag('conversations', 'Conversas do WhatsApp')
      .addTag('health', 'Health check')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // Start server
  const port = configService.get('PORT', 3000);
  await app.listen(port);

  bootstrapLogger.log(`Application is running on: http://localhost:${port}`);
  if (!isProduction) {
    bootstrapLogger.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
