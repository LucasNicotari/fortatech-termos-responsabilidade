import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';

export const termHistoryFilters = [
  'ALL',
  'DRAFT',
  'WAITING',
  'COMPLETED',
  'ATTENTION'
] as const;

export type TermHistoryFilter = typeof termHistoryFilters[number];

export class ListSendRequestsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(termHistoryFilters)
  filter: TermHistoryFilter = 'ALL';
}
