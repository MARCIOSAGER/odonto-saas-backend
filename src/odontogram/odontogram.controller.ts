import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OdontogramService } from './odontogram.service';
import { UpdateToothDto } from './dto/update-tooth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('odontogram')
@Controller('patients/:patientId/odontogram')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OdontogramController {
  constructor(private readonly odontogramService: OdontogramService) {}

  @Get()
  @ApiOperation({ summary: 'Get patient odontogram' })
  @ApiResponse({ status: 200, description: 'Odontogram data' })
  async get(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.odontogramService.getOrCreate(user.clinicId, patientId);
  }

  @Put('teeth/:toothNumber')
  @ApiOperation({ summary: 'Update a single tooth' })
  @ApiResponse({ status: 200, description: 'Tooth updated' })
  async updateTooth(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('toothNumber') toothNumber: string,
    @Body() dto: UpdateToothDto,
    @CurrentUser() user: { clinicId: string },
  ) {
    dto.tooth_number = parseInt(toothNumber, 10);
    return this.odontogramService.updateTooth(user.clinicId, patientId, dto);
  }

  @Put('teeth')
  @ApiOperation({ summary: 'Update multiple teeth (batch)' })
  @ApiResponse({ status: 200, description: 'Teeth updated' })
  async updateTeeth(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() teeth: UpdateToothDto[],
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.odontogramService.updateTeeth(
      user.clinicId,
      patientId,
      teeth,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get odontogram history' })
  @ApiResponse({ status: 200, description: 'History list' })
  async getHistory(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.odontogramService.getHistory(user.clinicId, patientId);
  }
}
