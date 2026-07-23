import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BitrixSignatureService } from './bitrix-signature.service';

@Controller('signature-provider')
@UseGuards(JwtAuthGuard)
export class SignatureProvidersController {
  constructor(private readonly bitrixSignature: BitrixSignatureService) {}

  @Get('status')
  status() {
    return this.bitrixSignature.internalStatus();
  }

  @Get('options')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  options() {
    return this.bitrixSignature.options();
  }

  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  save(
    @Body('representativeUserId') representativeUserId: number,
    @CurrentUser() user: { id: string }
  ) {
    return this.bitrixSignature.save(Number(representativeUserId), user.id);
  }
}
