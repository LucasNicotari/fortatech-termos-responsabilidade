import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateManualSendRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  employeeIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
