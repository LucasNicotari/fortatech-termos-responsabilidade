import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ZapSignService } from '../signature-providers/zapsign.service';
import { SignaturesService } from './signatures.service';

@Controller('integrations/zapsign')
export class ZapSignWebhookController {
  constructor(
    private readonly signatures: SignaturesService,
    private readonly zapSign: ZapSignService
  ) {}

  @Post('events')
  event(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    this.zapSign.assertWebhookAuthorization(authorization);
    return this.signatures.handleZapSignEvent(body);
  }
}
