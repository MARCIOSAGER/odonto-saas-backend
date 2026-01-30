import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClaudeService } from './claude.service';
import { AiService } from './ai.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [ClaudeService, AiService, WhatsAppService],
  exports: [ClaudeService, AiService, WhatsAppService],
})
export class IntegrationsModule {}
