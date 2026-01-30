import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all WhatsApp conversations grouped by phone' })
  @ApiResponse({ status: 200, description: 'Conversations list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.findAll(user.clinicId, { page, limit });
  }

  @Get(':phone')
  @ApiOperation({ summary: 'Get messages from a specific conversation by phone number' })
  @ApiResponse({ status: 200, description: 'Conversation messages' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findByPhone(
    @Param('phone') phone: string,
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.findByPhone(user.clinicId, phone, { page, limit });
  }

  @Post(':phone/read')
  @ApiOperation({ summary: 'Mark all messages in a conversation as read' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markAsRead(
    @Param('phone') phone: string,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.conversationsService.markAsRead(user.clinicId, phone);
  }

  @Post(':phone/send')
  @ApiOperation({ summary: 'Send a manual WhatsApp message to a conversation' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 400, description: 'Failed to send message' })
  async sendMessage(
    @Param('phone') phone: string,
    @Body() body: { message: string },
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.conversationsService.sendMessage(user.clinicId, phone, body.message);
  }
}
