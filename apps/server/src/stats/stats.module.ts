import { Module } from '@nestjs/common';
import { AdminCheckService } from '../auth/admin-check';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, AdminCheckService],
})
export class StatsModule {}
