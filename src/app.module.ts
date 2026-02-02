import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { ConversationsModule } from './conversations/conversations.module';
import { ReminderModule } from './reminders/reminder.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { BillingModule } from './billing/billing.module';
import { OdontogramModule } from './odontogram/odontogram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AutomationsModule } from './automations/automations.module';
import { AiClinicalModule } from './ai-clinical/ai-clinical.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { PatientPortalModule } from './patient-portal/patient-portal.module';
import { NpsModule } from './nps/nps.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { SystemConfigModule } from './system-config/system-config.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting (multi-tier)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

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
    ConversationsModule,
    ReminderModule,
    PlansModule,
    SubscriptionsModule,
    BillingModule,
    OdontogramModule,
    NotificationsModule,
    AutomationsModule,
    AiClinicalModule,
    PrescriptionsModule,
    PatientPortalModule,
    NpsModule,
    ReportsModule,
    AdminModule,
    SystemConfigModule,
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
