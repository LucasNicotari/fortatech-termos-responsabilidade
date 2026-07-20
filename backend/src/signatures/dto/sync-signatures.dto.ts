import { IsOptional, IsString } from 'class-validator';

export class SyncSignaturesDto {
  @IsOptional()
  @IsString()
  signatureId?: string;

  @IsOptional()
  @IsString()
  bitrixSignId?: string;
}
