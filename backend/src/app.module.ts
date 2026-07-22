import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BitrixModule } from './bitrix/bitrix.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LogsModule } from './logs/logs.module';
import { PrismaModule } from './prisma/prisma.module';
import { SendRequestsModule } from './send-requests/send-requests.module';
import { SignaturesModule } from './signatures/signatures.module';
import { TemplatesModule } from './templates/templates.module';
import { BitrixIntegrationsModule } from './integrations/bitrix-integrations.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { SignatureProvidersModule } from './signature-providers/signature-providers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    PrismaModule,
    AuthModule,
    TemplatesModule,
    SendRequestsModule,
    SignaturesModule,
    BitrixModule,
    BitrixIntegrationsModule,
    StorageModule,
    DocumentsModule,
    SignatureProvidersModule,
    DashboardModule,
    LogsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
