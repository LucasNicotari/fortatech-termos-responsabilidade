import { Module } from '@nestjs/common';
import { BitrixModule } from '../bitrix/bitrix.module';
import { LogsModule } from '../logs/logs.module';
import { TermNotificationsService } from './term-notifications.service';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [BitrixModule, LogsModule, WorkflowModule],
  providers: [TermNotificationsService],
  exports: [TermNotificationsService]
})
export class NotificationsModule {}
