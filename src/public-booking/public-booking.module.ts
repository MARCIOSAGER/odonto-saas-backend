import { Module } from '@nestjs/common';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
  exports: [PublicBookingService],
})
export class PublicBookingModule {}
