import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZapSignService } from './zapsign.service';

@Controller('signature-provider')
@UseGuards(JwtAuthGuard)
export class SignatureProvidersController {
  constructor(private readonly zapSign: ZapSignService) {}

  @Get('status')
  status() {
    return this.zapSign.status();
  }
}
