import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SigningJwtGuard } from '../auth/signing-jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CompleteInternalSignatureDto } from './dto/complete-internal-signature.dto';
import { SignaturesService } from './signatures.service';

interface SigningUser {
  invitationId: string;
  signatureId: string;
  bitrixUserId: string;
}

@ApiTags('internal-signing')
@ApiBearerAuth()
@UseGuards(SigningJwtGuard)
@Controller('signing')
export class InternalSignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get('session')
  session(@CurrentUser() user: SigningUser) {
    return this.signatures.getInternalSigningSession(user.invitationId);
  }

  @Post('complete')
  complete(@CurrentUser() user: SigningUser, @Body() dto: CompleteInternalSignatureDto) {
    return this.signatures.completeInternalSigning(user.invitationId, dto);
  }
}
