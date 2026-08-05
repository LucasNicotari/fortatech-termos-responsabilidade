import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { TermOperatorGuard } from '../common/term-operator.guard';
import { BulkRemoveSendRequestsDto } from './dto/bulk-remove-send-requests.dto';
import { CreateSendRequestDto, UpdateSendRequestDto } from './dto/create-send-request.dto';
import { ListSendRequestsDto } from './dto/list-send-requests.dto';
import { SendRequestsService } from './send-requests.service';

@ApiTags('send-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('send-requests')
export class SendRequestsController {
  constructor(private readonly sendRequests: SendRequestsService) {}

  @Get('page')
  findPage(@Query() query: ListSendRequestsDto) {
    return this.sendRequests.findPage(query);
  }

  @Get()
  findAll() {
    return this.sendRequests.findAll();
  }

  @Post()
  @UseGuards(TermOperatorGuard)
  create(
    @Body() dto: CreateSendRequestDto,
    @CurrentUser() user?: { id: string }
  ) {
    return this.sendRequests.createDraft(dto, user?.id);
  }

  @Patch(':id')
  @UseGuards(TermOperatorGuard)
  update(@Param('id') id: string, @Body() dto: UpdateSendRequestDto) {
    return this.sendRequests.updateDraft(id, dto);
  }

  @Post(':id/preview')
  @UseGuards(TermOperatorGuard)
  preview(@Param('id') id: string) {
    return this.sendRequests.preview(id);
  }

  @Post(':id/preview-url')
  @UseGuards(TermOperatorGuard)
  previewUrl(@Param('id') id: string) {
    return this.sendRequests.previewUrl(id);
  }

  @Post(':id/send')
  @UseGuards(TermOperatorGuard)
  send(
    @Param('id') id: string,
    @CurrentUser() user?: { bitrixUserId?: string }
  ) {
    return this.sendRequests.send(id, user?.bitrixUserId);
  }

  @Post(':id/retry')
  @UseGuards(TermOperatorGuard)
  retry(@Param('id') id: string) {
    return this.sendRequests.retry(id);
  }

  @Post('bulk-remove')
  @UseGuards(TermOperatorGuard)
  bulkRemoveFromHistory(
    @Body() dto: BulkRemoveSendRequestsDto,
    @CurrentUser() user?: { id: string }
  ) {
    return this.sendRequests.bulkRemoveFromHistory(dto.ids, user?.id);
  }

  @Delete(':id')
  @UseGuards(TermOperatorGuard)
  removeFromHistory(
    @Param('id') id: string,
    @CurrentUser() user?: { id: string }
  ) {
    return this.sendRequests.removeFromHistory(id, user?.id);
  }
}
