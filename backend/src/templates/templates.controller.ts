import { Body, Controller, Get, Param, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TemplatesService, UploadedDocx } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  findAll() {
    return this.templates.findAll();
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(
    @UploadedFile() file: UploadedDocx | undefined,
    @Body() body: Record<string, string | undefined>,
    @CurrentUser() user: { id: string }
  ) {
    return this.templates.upload(file, {
      templateId: body.templateId || undefined,
      name: body.name || undefined,
      version: body.version || '',
      description: body.description || undefined,
      makeDefault: body.makeDefault !== 'false'
    }, user.id);
  }

  @Put('versions/:id/default')
  setDefault(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.templates.setDefault(id, user.id);
  }

  @Patch('versions/:id')
  setVersionActive(
    @Param('id') id: string,
    @Body('active') active: boolean,
    @CurrentUser() user: { id: string }
  ) {
    return this.templates.setVersionActive(id, Boolean(active), user.id);
  }

  @Get('versions/:id/source')
  source(@Param('id') id: string) {
    return this.templates.sourceUrl(id);
  }
}
