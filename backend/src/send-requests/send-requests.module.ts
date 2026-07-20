import { Module } from '@nestjs/common';
import { BitrixModule } from '../bitrix/bitrix.module';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../storage/storage.module';
import { LogsModule } from '../logs/logs.module';
import { SendRequestsController } from './send-requests.controller';
import { SendRequestsService } from './send-requests.service';

@Module({
  imports: [BitrixModule, LogsModule, DocumentsModule, StorageModule],
  controllers: [SendRequestsController],
  providers: [SendRequestsService],
  exports: [SendRequestsService]
})
export class SendRequestsModule {}
