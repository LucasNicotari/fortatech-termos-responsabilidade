import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TermOperatorGuard } from '../common/term-operator.guard';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowService } from './workflow.service';

@Controller('term-workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('notification-defaults')
  @UseGuards(TermOperatorGuard)
  async notificationDefaults() {
    return {
      bitrixUserIds: await this.workflow.notificationRecipientIds()
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  matrix() {
    return this.workflow.matrix();
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  replace(@Body() dto: UpdateWorkflowDto, @CurrentUser() user: { id: string }) {
    return this.workflow.replace(dto, user.id);
  }
}
