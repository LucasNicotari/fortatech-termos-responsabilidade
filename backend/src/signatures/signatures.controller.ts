import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TermOperatorGuard } from '../common/term-operator.guard';
import { SyncSignaturesDto } from './dto/sync-signatures.dto';
import { SignaturesService } from './signatures.service';

@ApiTags('signatures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.signatures.findOne(id);
  }

  @Post('sync')
  @UseGuards(TermOperatorGuard)
  sync(@Body() dto: SyncSignaturesDto) {
    return this.signatures.sync(dto);
  }

  @Post(':id/retry')
  @UseGuards(TermOperatorGuard)
  retry(@Param('id') id: string) {
    return this.signatures.retry(id);
  }

  @Post(':id/archive/retry')
  @UseGuards(TermOperatorGuard)
  retryArchive(@Param('id') id: string) {
    return this.signatures.retryArchive(id);
  }

  @Get(':id/file')
  file(@Param('id') id: string) {
    return this.signatures.getFileUrl(id);
  }
}
