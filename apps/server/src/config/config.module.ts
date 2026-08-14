import { Global, Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

@Global()
@Module({
  providers: [ConfigService, AdminGuard],
  controllers: [ConfigController],
  exports: [ConfigService, AdminGuard],
})
export class ConfigModule {}
