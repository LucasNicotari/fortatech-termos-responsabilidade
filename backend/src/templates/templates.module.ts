import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { StorageModule } from '../storage/storage.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [StorageModule, DocumentsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService]
})
export class TemplatesModule {}
