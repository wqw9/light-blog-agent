import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }

  @Get('heatmap')
  heatmap() {
    return this.stats.heatmap();
  }

  @Get('monthly')
  monthly() {
    return this.stats.monthly();
  }

  @Get('top')
  top(@Query('limit') limit?: string) {
    return this.stats.top(Number(limit) || 10);
  }
}
