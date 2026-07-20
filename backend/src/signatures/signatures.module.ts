import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BitrixModule } from '../bitrix/bitrix.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [BitrixModule, StorageModule, HttpModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService]
})
export class SignaturesModule {}
