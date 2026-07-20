import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncSignaturesDto } from './dto/sync-signatures.dto';
import { SignaturesService } from './signatures.service';

@ApiTags('signatures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get()
  findAll() {
    return this.signatures.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.signatures.findOne(id);
  }

  @Post('sync')
  sync(@Body() dto: SyncSignaturesDto) {
    return this.signatures.sync(dto);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.signatures.retry(id);
  }

  @Post(':id/archive/retry')
  retryArchive(@Param('id') id: string) {
    return this.signatures.retryArchive(id);
  }

  @Get(':id/file')
  file(@Param('id') id: string) {
    return this.signatures.getFileUrl(id);
  }
}
