import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

export class EquipmentDto {
  @IsInt() @Min(1) @Max(1_000) quantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(300) description!: string;
  @IsOptional() @IsString() @MaxLength(200) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) assetTag?: string;
  @IsOptional() @IsString() @MaxLength(300) accessories?: string;
}

export class CreateSendRequestDto {
  @Type(() => Number) @IsInt() @Min(1) employeeBitrixUserId!: number;
  @IsOptional() @IsEmail() @MaxLength(254) employeeEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) employeeName?: string;
  @IsString() @IsNotEmpty() @MinLength(11) @MaxLength(14) cpf!: string;
  @IsOptional() @IsString() @MaxLength(200) cargo?: string;
  @IsOptional() @IsString() @MaxLength(300) departamento?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(64) templateVersionId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => EquipmentDto)
  equipment!: EquipmentDto[];
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(5_000)
  @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true })
  notificationRecipientBitrixUserIds?: number[];
}

export class UpdateSendRequestDto extends CreateSendRequestDto {}
