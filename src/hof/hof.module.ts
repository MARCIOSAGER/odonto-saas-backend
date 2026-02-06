import { Module } from '@nestjs/common';
import { HofController } from './hof.controller';
import { HofService } from './hof.service';
import { FaceogramController } from './faceogram/faceogram.controller';
import { FaceogramService } from './faceogram/faceogram.service';
import { HofAnamnesisController } from './anamnesis/hof-anamnesis.controller';
import { HofAnamnesisService } from './anamnesis/hof-anamnesis.service';
import { HofSessionsController } from './sessions/hof-sessions.controller';
import { HofSessionsService } from './sessions/hof-sessions.service';
import { HofPhotosController } from './photos/hof-photos.controller';
import { HofPhotosService } from './photos/hof-photos.service';
import { HofPlanController } from './plan/hof-plan.controller';
import { HofPlanService } from './plan/hof-plan.service';
import { HofConsentController } from './consent/hof-consent.controller';
import { HofConsentService } from './consent/hof-consent.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [
    HofController,
    FaceogramController,
    HofAnamnesisController,
    HofSessionsController,
    HofPhotosController,
    HofPlanController,
    HofConsentController,
  ],
  providers: [
    HofService,
    FaceogramService,
    HofAnamnesisService,
    HofSessionsService,
    HofPhotosService,
    HofPlanService,
    HofConsentService,
  ],
  exports: [HofService, FaceogramService],
})
export class HofModule {}
