import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { SignatureProvidersController } from './signature-providers.controller';
import { ZapSignService } from './zapsign.service';

@Module({
  imports: [HttpModule, LogsModule],
  controllers: [SignatureProvidersController],
  providers: [ZapSignService],
  exports: [ZapSignService]
})
export class SignatureProvidersModule {}
