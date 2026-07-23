import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CompleteLocalSignatureDto } from './dto/complete-local-signature.dto';
import { SignaturesService } from './signatures.service';

@ApiTags('local-signatures')
@Controller('local-signatures')
export class LocalSignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get(':token')
  session(@Param('token') token: string) {
    return this.signatures.getLocalSigningSession(token);
  }

  @Post(':token/complete')
  complete(@Param('token') token: string, @Body() dto: CompleteLocalSignatureDto) {
    return this.signatures.completeLocalSigning(token, dto);
  }
}
