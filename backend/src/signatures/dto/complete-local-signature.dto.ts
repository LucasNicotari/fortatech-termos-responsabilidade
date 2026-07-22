import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CompleteLocalSignatureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  signatureDataUrl!: string;
}
