import { Module } from '@nestjs/common';
import { BitrixModule } from '../bitrix/bitrix.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { BitrixIntegrationsController } from './bitrix-integrations.controller';
import { BitrixIntegrationsService } from './bitrix-integrations.service';

@Module({
  imports: [BitrixModule, SignaturesModule],
  controllers: [BitrixIntegrationsController],
  providers: [BitrixIntegrationsService],
  exports: [BitrixIntegrationsService]
})
export class BitrixIntegrationsModule {}
