import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateSendRequestDto, UpdateSendRequestDto } from './dto/create-send-request.dto';
import { SendRequestsService } from './send-requests.service';

@ApiTags('send-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('send-requests')
export class SendRequestsController {
  constructor(private readonly sendRequests: SendRequestsService) {}

  @Get()
  findAll() {
    return this.sendRequests.findAll();
  }

  @Post()
  create(
    @Body() dto: CreateSendRequestDto,
    @CurrentUser() user?: { id: string }
  ) {
    return this.sendRequests.createDraft(dto, user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSendRequestDto) {
    return this.sendRequests.updateDraft(id, dto);
  }

  @Post(':id/preview')
  preview(@Param('id') id: string) {
    return this.sendRequests.preview(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.sendRequests.send(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.sendRequests.retry(id);
  }
}
