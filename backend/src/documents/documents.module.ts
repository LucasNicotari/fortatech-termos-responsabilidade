import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DocumentsService } from './documents.service';

@Module({ imports: [StorageModule], providers: [DocumentsService], exports: [DocumentsService] })
export class DocumentsModule {}
