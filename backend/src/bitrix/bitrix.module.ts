import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { BitrixService } from './bitrix.service';
import { TokenCryptoService } from './token-crypto.service';

@Module({
  imports: [HttpModule, LogsModule],
  providers: [BitrixService, TokenCryptoService],
  exports: [BitrixService, TokenCryptoService]
})
export class BitrixModule {}
