import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  nome: string;

  @IsString()
  versao: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
