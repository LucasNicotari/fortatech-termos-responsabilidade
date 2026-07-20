import { Module } from '@nestjs/common';
import { BitrixModule } from '../bitrix/bitrix.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [BitrixModule],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
