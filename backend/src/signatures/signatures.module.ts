import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BitrixModule } from '../bitrix/bitrix.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { StorageModule } from '../storage/storage.module';
import { SignatureProvidersModule } from '../signature-providers/signature-providers.module';
import { ZapSignWebhookController } from './zapsign-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LocalSignaturesController } from './local-signatures.controller';

@Module({
  imports: [BitrixModule, StorageModule, HttpModule, SignatureProvidersModule, NotificationsModule, WorkflowModule],
  controllers: [SignaturesController, ZapSignWebhookController, LocalSignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService]
})
export class SignaturesModule {}
