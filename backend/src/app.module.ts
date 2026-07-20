import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BitrixModule } from './bitrix/bitrix.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmployeesModule } from './employees/employees.module';
import { LogsModule } from './logs/logs.module';
import { PrismaModule } from './prisma/prisma.module';
import { SendRequestsModule } from './send-requests/send-requests.module';
import { SignaturesModule } from './signatures/signatures.module';
import { TemplatesModule } from './templates/templates.module';
import { UsersModule } from './users/users.module';
import { BitrixIntegrationsModule } from './integrations/bitrix-integrations.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    TemplatesModule,
    SendRequestsModule,
    SignaturesModule,
    BitrixModule,
    BitrixIntegrationsModule,
    StorageModule,
    DocumentsModule,
    DashboardModule,
    LogsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
