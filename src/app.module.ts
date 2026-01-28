import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClinicsModule } from './clinics/clinics.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DentistsModule } from './dentists/dentists.module';
import { ServicesModule } from './services/services.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { HealthController } from './health/health.controller';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting (10 requests per minute)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL', 60000),
          limit: config.get('THROTTLE_LIMIT', 10),
        },
      ],
    }),

    // Health check
    TerminusModule,

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    ClinicsModule,
    PatientsModule,
    AppointmentsModule,
    DentistsModule,
    ServicesModule,
    WebhooksModule,
    IntegrationsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
