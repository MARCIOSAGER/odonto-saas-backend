import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateClinicStatusDto } from './dto/update-clinic-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // =====================
  // STATS
  // =====================

  @Get('stats')
  @ApiOperation({ summary: 'Get global admin stats' })
  @ApiResponse({ status: 200, description: 'Admin statistics' })
  async getStats() {
    return this.adminService.getStats();
  }

  // =====================
  // USERS
  // =====================

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'clinic_id', required: false, type: String })
  async findAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('clinic_id') clinic_id?: string,
  ) {
    return this.adminService.findAllUsers({ page: +page || 1, limit: +limit || 20, search, role, status, clinic_id });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details' })
  async findOneUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findOneUser(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Update user status (active/inactive)' })
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.adminService.updateUserStatus(id, dto.status, user.userId);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.adminService.updateUserRole(id, dto.role, user.userId);
  }

  @Post('users/:id/reset-password')
  @ApiOperation({ summary: 'Force password reset for a user' })
  async resetUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.adminService.resetUserPassword(id, user.userId);
  }

  // =====================
  // CLINICS
  // =====================

  @Get('clinics')
  @ApiOperation({ summary: 'List all clinics with counts (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAllClinics(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.findAllClinics({ page: +page || 1, limit: +limit || 20, search, status });
  }

  @Patch('clinics/:id/status')
  @ApiOperation({ summary: 'Update clinic status (active/inactive/suspended)' })
  async updateClinicStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicStatusDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.adminService.updateClinicStatus(id, dto.status, user.userId);
  }
}
