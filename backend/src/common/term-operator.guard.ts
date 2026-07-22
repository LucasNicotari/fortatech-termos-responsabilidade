import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class TermOperatorGuard implements CanActivate {
  constructor(private readonly workflow: WorkflowService) {}

  async canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as { bitrixUserId?: string } | undefined;
    if (await this.workflow.canOperate(user?.bitrixUserId)) return true;
    throw new ForbiddenException('Somente Lucas ou Osmar podem criar, editar e enviar termos');
  }
}
