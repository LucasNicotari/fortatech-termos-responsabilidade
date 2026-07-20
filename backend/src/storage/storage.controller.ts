import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('local')
  @Header('Cache-Control', 'private, no-store')
  async localFile(
    @Query('path') path: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() response: Response
  ) {
    const file = await this.storage.readSignedLocalFile(path, Number(expires), signature);
    response.type(file.fileName.toLowerCase().endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/["\\]/g, '_')}"`);
    response.send(file.contents);
  }
}
