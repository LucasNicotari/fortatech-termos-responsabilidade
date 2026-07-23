import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { BitrixModule } from '../bitrix/bitrix.module';
import { SignatureProvidersController } from './signature-providers.controller';
import { BitrixSignatureService } from './bitrix-signature.service';
import { ZapSignService } from './zapsign.service';

@Module({
  imports: [HttpModule, LogsModule, BitrixModule],
  controllers: [SignatureProvidersController],
  providers: [ZapSignService, BitrixSignatureService],
  exports: [ZapSignService, BitrixSignatureService]
})
export class SignatureProvidersModule {}
