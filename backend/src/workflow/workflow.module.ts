import { Module } from '@nestjs/common';
import { BitrixModule } from '../bitrix/bitrix.module';
import { TermOperatorGuard } from '../common/term-operator.guard';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [BitrixModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, TermOperatorGuard],
  exports: [WorkflowService, TermOperatorGuard]
})
export class WorkflowModule {}
