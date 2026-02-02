import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SystemConfigItemDto {
  @ApiProperty({ example: 'platform_name' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Odonto SaaS' })
  @IsString()
  value: string;
}

export class BulkUpsertSystemConfigDto {
  @ApiProperty({ type: [SystemConfigItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SystemConfigItemDto)
  configs: SystemConfigItemDto[];
}
