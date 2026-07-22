import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, Min, ValidateNested } from 'class-validator';

export class WorkflowAssignmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bitrixUserId!: number;

  @IsBoolean()
  canOperate!: boolean;

  @IsBoolean()
  receiveNotifications!: boolean;

  @IsBoolean()
  hasAccess!: boolean;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateWorkflowDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WorkflowAssignmentDto)
  assignments!: WorkflowAssignmentDto[];
}
