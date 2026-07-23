import { SignatureMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteInternalSignatureDto {
  @IsEnum(SignatureMethod)
  method!: SignatureMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  signatureDataUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  typedName?: string;

  @IsBoolean()
  accepted!: boolean;
}
