import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class EquipmentDto {
  @IsInt() @Min(1) quantity!: number;
  @IsString() @IsNotEmpty() description!: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() assetTag?: string;
  @IsOptional() @IsString() accessories?: string;
}

export class CreateSendRequestDto {
  @Type(() => Number) @IsInt() @Min(1) employeeBitrixUserId!: number;
  @IsEmail() employeeEmail!: string;
  @IsString() @IsNotEmpty() employeeName!: string;
  @IsString() @IsNotEmpty() cpf!: string;
  @IsOptional() @IsString() cargo?: string;
  @IsString() @IsNotEmpty() departamento!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() templateVersionId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EquipmentDto)
  equipment!: EquipmentDto[];
  @IsOptional() @IsArray() @ArrayUnique() @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true })
  notificationRecipientBitrixUserIds?: number[];
}

export class UpdateSendRequestDto extends CreateSendRequestDto {}
